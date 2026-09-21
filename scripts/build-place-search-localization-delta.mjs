import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { asianLocales, mergePlaceLocalizations } from './place-search-localizations.mjs'

const root = resolve(import.meta.dirname, '..')
const sourcePath = 'data/place-search/wikidata-localizations-20260921.ndjson'
const outputPath = resolve(root, '.generated/place-search-localization-delta.sql')
const previousRevision = process.argv[2] || 'HEAD'
if (!/^[A-Za-z0-9_./^-]{1,100}$/.test(previousRevision)) throw new Error('Invalid previous revision')
const gitShow = path => {
  try {
    return execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'show', `${previousRevision}:${path}`],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch (error) {
    if (error.status === 128 && path.endsWith('google-translation-fallbacks-20260921.ndjson')) return null
    throw error
  }
}
const oldText = gitShow(sourcePath)
const newText = await readFile(resolve(root, sourcePath), 'utf8')
const googlePath = 'data/place-search/google-translation-fallbacks-20260921.ndjson'
const newGoogle = await readFile(resolve(root, googlePath), 'utf8').catch(error => {
  if (error.code === 'ENOENT') return null
  throw error
})
const old = mergePlaceLocalizations(oldText, gitShow(googlePath))
const next = mergePlaceLocalizations(newText, newGoogle)
const [seedMetadata, ...seedRows] = (await readFile(resolve(root, 'data/place-search/place-search-seed-20260920.ndjson'), 'utf8'))
  .trim().split(/\r?\n/).map(JSON.parse)
const curatedAliases = JSON.parse(await readFile(resolve(root, 'data/place-search/curated-search-aliases.json'), 'utf8'))
if (old.metadata.sourceSeedHash !== next.metadata.sourceSeedHash || next.metadata.sourceSeedHash !== seedMetadata.sourceHash
  || old.metadata.eligibleCount !== next.metadata.eligibleCount) throw new Error('Incompatible localization datasets')

const oldById = old.rows
const newById = next.rows
const indexedTerm = term => term ? JSON.stringify([term.name, term.aliases, term.sourceLanguage]) : null
const sql = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`
const number = value => Number.isSafeInteger(value) ? String(value) : 'NULL'
const statements = []
let changedTerms = 0
for (const [index, place] of seedRows.entries()) {
  if (place.searchScope !== 'preview' || !place.selectedCoordinate) continue
  const component = seedMetadata.componentDatasets.find((_, componentIndex) => index < seedMetadata.componentDatasets
    .slice(0, componentIndex + 1).reduce((sum, item) => sum + item.count, 0))
  if (!component) throw new Error(`Missing component for ${place.id}`)
  for (const locale of asianLocales) {
    const oldRow = oldById.get(place.id)
    const newRow = newById.get(place.id)
    const oldTerm = oldRow?.names?.[locale]
    const newTerm = newRow?.names?.[locale]
    if (newTerm?.sourceLanguage === 'en' && newTerm.sourceEnglish !== place.nameEn)
      throw new Error(`Mismatched English translation source for ${place.id}`)
    if (indexedTerm(oldTerm) === indexedTerm(newTerm)) continue
    statements.push(`DELETE FROM place_search_localized_fts WHERE place_id = ${sql(place.id)} AND locale = ${sql(locale)};`)
    statements.push(`DELETE FROM place_localizations WHERE place_id = ${sql(place.id)} AND locale = ${sql(locale)};`)
    if (newTerm) statements.push(`INSERT INTO place_localizations (place_id, locale, name, aliases_json, source_language, source_revision) VALUES (${sql(place.id)}, ${sql(locale)}, ${sql(newTerm.name)}, ${sql(JSON.stringify(newTerm.aliases))}, ${sql(newTerm.sourceLanguage)}, ${number(newRow.revision)});`)
    const aliasesEn = [...new Set([...(place.aliases?.en ?? []), ...(curatedAliases[place.id]?.en ?? [])])]
    statements.push(`INSERT INTO place_search_localized_fts (place_id, locale, name, aliases, name_en, aliases_en, source_dataset) VALUES (${sql(place.id)}, ${sql(locale)}, ${sql(newTerm?.name || place.nameEn)}, ${sql((newTerm?.aliases ?? []).join(' '))}, ${sql(place.nameEn)}, ${sql(aliasesEn.join(' '))}, ${sql(component.id)});`)
    changedTerms++
  }
}
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${statements.join('\n')}\n`)
console.log(JSON.stringify({ outputPath, statements: statements.length, changedTerms }))
