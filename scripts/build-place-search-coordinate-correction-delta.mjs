import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { asianLocales, mergePlaceLocalizations } from './place-search-localizations.mjs'
import { mergePreviewCoordinateCorrections, resolveBusanStationCorrections, resolvePreviewCoordinateCorrections } from './place-search-coordinate-corrections.mjs'

const root = resolve(import.meta.dirname, '..')
const [metadata, ...records] = (await readFile(resolve(root, 'data/place-search/place-search-seed-20260920.ndjson'), 'utf8'))
  .trim().split(/\r?\n/).map(JSON.parse)
const config = JSON.parse(await readFile(resolve(root, 'data/place-search/preview-coordinate-corrections-20260921.json'), 'utf8'))
const busanConfig = JSON.parse(await readFile(resolve(root, 'data/place-search/preview-busan-station-corrections-20260921.json'), 'utf8'))
const corrections = mergePreviewCoordinateCorrections(
  resolvePreviewCoordinateCorrections(metadata, records, config),
  resolveBusanStationCorrections(metadata, records, busanConfig))
const curatedAliases = JSON.parse(await readFile(resolve(root, 'data/place-search/curated-search-aliases.json'), 'utf8'))
const googleText = await readFile(resolve(root, 'data/place-search/google-translation-fallbacks-20260921.ndjson'), 'utf8')
const holds = JSON.parse(await readFile(resolve(root, 'data/place-search/google-translation-holds-20260921.json'), 'utf8'))
const heldPairs = new Set(holds.flatMap(hold => hold.locales.map(locale => `${hold.id}:${locale}`)))
const officialOverrides = JSON.parse(await readFile(resolve(root, 'data/place-search/official-localization-overrides-20260921.json'), 'utf8'))
const { metadata: localizationMetadata, rows: localizations } = mergePlaceLocalizations(
  await readFile(resolve(root, 'data/place-search/wikidata-localizations-20260921.ndjson'), 'utf8'),
  googleText, heldPairs, officialOverrides)
if (localizationMetadata.sourceSeedHash !== metadata.sourceHash) throw new Error('Incompatible localizations')

const sql = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`
const json = value => sql(JSON.stringify(value))
const statements = []
for (const [index, place] of records.entries()) {
  const correction = corrections.get(place.id)
  if (!correction) continue
  const component = metadata.componentDatasets.find((_, componentIndex) => index < metadata.componentDatasets
    .slice(0, componentIndex + 1).reduce((sum, item) => sum + item.count, 0))
  if (!component) throw new Error(`Missing component for ${place.id}`)
  const { latitude, longitude } = correction.coordinate
  const officialNameCorrections = officialOverrides.filter(override => override.id === place.id)
    .map(({ locale, name, sourceUrl }) => ({ locale, name, sourceUrl }))
  const audit = { ...place, selectedCoordinate: correction.coordinate,
    previewCoordinateCorrection: correction.evidence,
    ...(officialNameCorrections.length ? { officialLocalizationOverrides: officialNameCorrections } : {}) }
  const previous = correction.evidence.previousCoordinate
  const guard = `id = ${sql(place.id)} AND search_scope = 'preview' AND production_approved = 0 AND abs(latitude - ${latitude}) < 0.00000001 AND abs(longitude - ${longitude}) < 0.00000001`
  statements.push(`UPDATE places SET latitude = ${latitude}, longitude = ${longitude}, status = 'usable_preview', search_scope = 'preview', audit_json = ${json(audit)} WHERE id = ${sql(place.id)} AND production_approved = 0 AND ((search_scope = 'disabled' AND status = 'pending_review') OR (search_scope = 'preview' AND status = 'usable_preview')) AND abs(latitude - ${previous.latitude}) < 0.00000001 AND abs(longitude - ${previous.longitude}) < 0.00000001;`)
  statements.push(`UPDATE places SET audit_json = ${json(audit)} WHERE ${guard};`)
  for (const table of ['place_search_fts', 'place_search_localized_fts', 'place_localizations']) {
    statements.push(`DELETE FROM ${table} WHERE place_id = ${sql(place.id)} AND EXISTS (SELECT 1 FROM places WHERE ${guard});`)
  }
  const aliasesEn = [...new Set([...(place.aliases?.en ?? []), ...(curatedAliases[place.id]?.en ?? [])])]
  const regionEn = (place.regions?.values ?? []).map(region => region.nameEn).filter(Boolean).join(', ')
  statements.push(`INSERT INTO place_search_fts (place_id, name_en, aliases_en, region_en, name_ko, aliases_ko, source_dataset) SELECT ${sql(place.id)}, ${sql(place.nameEn)}, ${sql(aliasesEn.join(' '))}, ${sql(regionEn)}, ${sql(place.nameKo)}, ${sql((place.aliases?.ko ?? []).join(' '))}, ${sql(component.id)} FROM places WHERE ${guard};`)
  for (const locale of asianLocales) {
    const localized = localizations.get(place.id)
    const term = localized?.names?.[locale]
    if (term?.sourceLanguage === 'en' && term.sourceEnglish !== place.nameEn)
      throw new Error(`Mismatched English translation source for ${place.id}`)
    if (term) statements.push(`INSERT INTO place_localizations (place_id, locale, name, aliases_json, source_language, source_revision) SELECT ${sql(place.id)}, ${sql(locale)}, ${sql(term.name)}, ${json(term.aliases)}, ${sql(term.sourceLanguage)}, ${term.sourceUrl ? 'NULL' : localized.revision} FROM places WHERE ${guard};`)
    statements.push(`INSERT INTO place_search_localized_fts (place_id, locale, name, aliases, name_en, aliases_en, source_dataset) SELECT ${sql(place.id)}, ${sql(locale)}, ${sql(term?.name || place.nameEn)}, ${sql((term?.aliases ?? []).join(' '))}, ${sql(place.nameEn)}, ${sql(aliasesEn.join(' '))}, ${sql(component.id)} FROM places WHERE ${guard};`)
  }
}
const outputPath = resolve(root, '.generated/place-search-coordinate-correction-delta.sql')
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${statements.join('\n')}\n`)
console.log(JSON.stringify({ outputPath, corrected: corrections.size, statements: statements.length }))
