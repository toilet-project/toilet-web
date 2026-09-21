import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { asianLocales, mergePlaceLocalizations } from './place-search-localizations.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map(process.argv.slice(2).map((value, index, values) => value.startsWith('--') ? [value, values[index + 1]] : null).filter(Boolean))
const seedPath = resolve(args.get('--seed') || `${root}/data/place-search/place-search-seed-20260920.ndjson`)
const outputPath = resolve(args.get('--output') || `${root}/.generated/place-search-import.sql`)
const [metadata, ...rows] = (await readFile(seedPath, 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line))
const allRecords = rows.map(({ type: _type, ...record }) => record)
const componentId = args.get('--component')
const componentIndex = metadata.componentDatasets?.findIndex(component => component.id === componentId) ?? -1
if (componentId && componentIndex < 0) throw new Error(`Unknown component dataset: ${componentId}`)
const component = componentId ? metadata.componentDatasets[componentIndex] : null
const componentOffset = component ? metadata.componentDatasets.slice(0, componentIndex).reduce((sum, item) => sum + item.count, 0) : 0
const seed = component
  ? { ...metadata, datasetId: component.id, sourceHash: component.sourceHash, sourceCount: component.count,
    records: allRecords.slice(componentOffset, componentOffset + component.count) }
  : { ...metadata, records: allRecords }
const curatedAliases = JSON.parse(await readFile(`${root}/data/place-search/curated-search-aliases.json`, 'utf8'))
const googlePath = `${root}/data/place-search/google-translation-fallbacks-20260921.ndjson`
const googleText = await readFile(googlePath, 'utf8').catch(error => {
  if (error.code === 'ENOENT') return null
  throw error
})
const translationHolds = JSON.parse(await readFile(`${root}/data/place-search/google-translation-holds-20260921.json`, 'utf8'))
const heldPairs = new Set(translationHolds.flatMap(hold => hold.locales.map(locale => `${hold.id}:${locale}`)))
const { metadata: localizationMetadata, rows: localizedNames } = mergePlaceLocalizations(
  await readFile(`${root}/data/place-search/wikidata-localizations-20260921.ndjson`, 'utf8'), googleText, heldPairs)

const sql = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`
const number = (value) => Number.isFinite(value) ? String(value) : 'NULL'
const json = (value) => sql(JSON.stringify(value ?? null))
const normalize = (value) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')

if (metadata.type !== 'dataset' || rows.some(row => row.type !== 'place') || allRecords.length !== metadata.sourceCount
  || (metadata.componentDatasets && metadata.componentDatasets.reduce((sum, item) => sum + item.count, 0) !== allRecords.length)
  || seed.records.length !== seed.sourceCount) throw new Error('Invalid place search seed')
if (localizationMetadata.type !== 'dataset' || localizationMetadata.sourceSeedHash !== metadata.sourceHash
  || localizationMetadata.eligibleCount !== allRecords.filter(place => place.searchScope === 'preview').length
  || [...localizedNames.values()].some(row => !allRecords.some(place => place.id === row.id && place.searchScope === 'preview')))
  throw new Error('Invalid place search localizations')
for (const place of allRecords) {
  const translated = localizedNames.get(place.id)?.names
  if (translated && Object.values(translated).some(term => term.sourceLanguage === 'en' && term.sourceEnglish !== place.nameEn)) {
    throw new Error(`Mismatched English translation source for ${place.id}`)
  }
}
for (const [id, override] of Object.entries(curatedAliases)) {
  const place = seed.records.find(record => record.id === id)
  if (!place && component && allRecords.some(record => record.id === id)) continue
  if (!place || place.searchScope !== 'preview' || place.productionApproved || !Array.isArray(override.en)
    || override.en.length === 0 || override.en.some(alias => typeof alias !== 'string' || !/^[A-Za-z][A-Za-z\s-]{1,79}$/.test(alias))
    || typeof override.source !== 'string' || !override.source.startsWith('https://english.seoul.go.kr/')) {
    throw new Error(`Invalid curated search alias: ${id}`)
  }
  place.aliases = { ...place.aliases, en: [...new Set([...(place.aliases?.en ?? []), ...override.en])] }
  place.curatedAliasSource = override.source
}

const statements = [
  `INSERT INTO source_datasets (id, schema_version, audited_at, as_of, source_hash, source_count, licenses_json) VALUES (${sql(seed.datasetId)}, ${number(seed.schemaVersion)}, ${sql(seed.auditedAt)}, ${sql(seed.asOf)}, ${sql(seed.sourceHash)}, ${number(seed.sourceCount)}, ${json(seed.sourceLicenses)}) ON CONFLICT(id) DO UPDATE SET schema_version=excluded.schema_version, audited_at=excluded.audited_at, as_of=excluded.as_of, source_hash=excluded.source_hash, source_count=excluded.source_count, licenses_json=excluded.licenses_json, imported_at=CURRENT_TIMESTAMP;`,
  `DELETE FROM place_search_fts WHERE source_dataset = ${sql(seed.datasetId)};`,
  `DELETE FROM place_search_localized_fts WHERE source_dataset = ${sql(seed.datasetId)};`,
  `DELETE FROM places WHERE source_dataset = ${sql(seed.datasetId)};`,
]

for (const place of seed.records) {
  const regionEn = (place.regions?.values ?? []).map(region => region.nameEn).filter(Boolean).join(', ')
  const selected = place.selectedCoordinate
  statements.push(`INSERT INTO places (id, source_dataset, name_ko, name_en, category, place_kind, status, search_scope, production_approved, verification_level, region_en, latitude, longitude, source_url, source_revision, source_modified_at, audit_json) VALUES (${sql(place.id)}, ${sql(seed.datasetId)}, ${sql(place.nameKo)}, ${sql(place.nameEn)}, ${sql(place.category)}, ${sql(place.placeKind)}, ${sql(place.status)}, ${sql(place.searchScope)}, ${place.productionApproved ? 1 : 0}, ${sql(place.verificationLevel)}, ${sql(regionEn)}, ${number(selected?.latitude)}, ${number(selected?.longitude)}, ${sql(place.sourceUrl)}, ${number(place.sourceRevision)}, ${sql(place.sourceModifiedAt)}, ${json(place)});`)

  for (const locale of ['ko', 'en']) {
    for (const alias of place.aliases?.[locale] ?? []) {
      statements.push(`INSERT INTO place_aliases (place_id, locale, alias, alias_normalized) VALUES (${sql(place.id)}, ${sql(locale)}, ${sql(alias)}, ${sql(normalize(alias))});`)
    }
  }
  place.coordinateCandidates.forEach((candidate, index) => {
    statements.push(`INSERT INTO place_coordinate_candidates (place_id, candidate_index, latitude, longitude, rank, eligible, precision_degrees, evidence_json) VALUES (${sql(place.id)}, ${index}, ${number(candidate.latitude)}, ${number(candidate.longitude)}, ${sql(candidate.rank)}, ${candidate.eligible ? 1 : 0}, ${number(candidate.precisionDegrees)}, ${json(candidate)});`)
  })

  if (place.searchScope === 'preview' && selected) {
    statements.push(`INSERT INTO place_search_fts (place_id, name_en, aliases_en, region_en, name_ko, aliases_ko, source_dataset) VALUES (${sql(place.id)}, ${sql(place.nameEn)}, ${sql((place.aliases?.en ?? []).join(' '))}, ${sql(regionEn)}, ${sql(place.nameKo)}, ${sql((place.aliases?.ko ?? []).join(' '))}, ${sql(seed.datasetId)});`)
    const localized = localizedNames.get(place.id)
    for (const locale of asianLocales) {
      const term = localized?.names?.[locale]
      if (term) statements.push(`INSERT INTO place_localizations (place_id, locale, name, aliases_json, source_language, source_revision) VALUES (${sql(place.id)}, ${sql(locale)}, ${sql(term.name)}, ${json(term.aliases)}, ${sql(term.sourceLanguage)}, ${number(localized.revision)});`)
      statements.push(`INSERT INTO place_search_localized_fts (place_id, locale, name, aliases, name_en, aliases_en, source_dataset) VALUES (${sql(place.id)}, ${sql(locale)}, ${sql(term?.name || place.nameEn)}, ${sql((term?.aliases ?? []).join(' '))}, ${sql(place.nameEn)}, ${sql((place.aliases?.en ?? []).join(' '))}, ${sql(seed.datasetId)});`)
    }
  }
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${statements.join('\n')}\n`)
console.log(JSON.stringify({ outputPath, statements: statements.length, records: seed.records.length }))
