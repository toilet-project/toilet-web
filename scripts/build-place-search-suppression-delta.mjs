import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { resolvePreviewSuppressions } from './place-search-suppressions.mjs'

const root = resolve(import.meta.dirname, '..')
const [metadata, ...records] = (await readFile(resolve(root, 'data/place-search/place-search-seed-20260920.ndjson'), 'utf8'))
  .trim().split(/\r?\n/).map(JSON.parse)
const config = JSON.parse(await readFile(resolve(root, 'data/place-search/preview-suppressions-20260921.json'), 'utf8'))
const suppressed = resolvePreviewSuppressions(metadata, records, config)
const outputPath = resolve(root, '.generated/place-search-suppression-delta.sql')
const sql = value => `'${String(value).replaceAll("'", "''")}'`
const statements = []

for (const place of records) {
  const suppression = suppressed.get(place.id)
  if (!suppression) continue
  statements.push(`UPDATE places SET status = 'pending_review', search_scope = 'disabled', audit_json = json_set(audit_json, '$.searchSuppression', json(${sql(JSON.stringify(suppression))})) WHERE id = ${sql(place.id)} AND search_scope = 'preview' AND abs(latitude - ${place.selectedCoordinate.latitude}) < 0.00000001 AND abs(longitude - ${place.selectedCoordinate.longitude}) < 0.00000001;`)
  statements.push(`DELETE FROM place_search_fts WHERE place_id = ${sql(place.id)};`)
  statements.push(`DELETE FROM place_search_localized_fts WHERE place_id = ${sql(place.id)};`)
  statements.push(`DELETE FROM place_localizations WHERE place_id = ${sql(place.id)};`)
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${statements.join('\n')}\n`)
console.log(JSON.stringify({ outputPath, suppressed: suppressed.size, statements: statements.length }))
