import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { placeSearchCategory } from './place-search-category.mjs'

const args = new Map(process.argv.slice(2).map((value, index, values) => value.startsWith('--') ? [value, values[index + 1]] : null).filter(Boolean))
const basePath = resolve(args.get('--base') || 'data/place-search/place-search-seed-20260920.ndjson')
const extensionPath = resolve(args.get('--extension') || '')
const outputPath = resolve(args.get('--output') || basePath)
if (!args.get('--extension')) throw new Error('Use --extension <places-audited-extension-1000.json>')

const [baseMetadata, ...baseRows] = (await readFile(basePath, 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line))
const extension = JSON.parse(await readFile(extensionPath, 'utf8'))
const baseRecords = baseRows.map(({ type: _type, ...record }) => record)
const extensionRecords = extension.places.map(place => ({
  ...place,
  searchScope: place.status === 'usable_preview' ? 'preview' : 'disabled',
}))
const records = [...baseRecords, ...extensionRecords].map(place => {
  const category = placeSearchCategory(place)
  return { ...place, categoryCode: category.code, categoryLabelKo: category.ko, categoryLabelEn: category.en }
})
if (records.length !== 2000 || new Set(records.map(place => place.id)).size !== 2000) throw new Error('Combined seed must contain 2,000 unique places')
if (records.some(place => place.productionApproved)) throw new Error('No collected place is production-approved')

const counts = records.reduce((summary, place) => {
  summary[place.status] = (summary[place.status] ?? 0) + 1
  return summary
}, {})
const metadata = {
  ...baseMetadata,
  schemaVersion: Math.max(baseMetadata.schemaVersion ?? 1, extension.schemaVersion ?? 1) + 1,
  auditedAt: extension.auditedAt,
  asOf: extension.asOf,
  sourceHash: createHash('sha256').update(`${baseMetadata.sourceHash}:${extension.sourceHash}`).digest('hex'),
  sourceCount: records.length,
  counts,
  componentDatasets: [
    { id: baseMetadata.datasetId, count: baseRecords.length, sourceHash: baseMetadata.sourceHash },
    { id: extension.datasetId, count: extensionRecords.length, sourceHash: extension.sourceHash },
  ],
}
await writeFile(outputPath, [JSON.stringify(metadata), ...records.map(place => JSON.stringify({ type: 'place', ...place }))].join('\n') + '\n')
console.log(JSON.stringify({ outputPath, records: records.length, counts }, null, 2))
