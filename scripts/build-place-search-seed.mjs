import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map(process.argv.slice(2).map((value, index, values) => value.startsWith('--') ? [value, values[index + 1]] : null).filter(Boolean))
const sourcePath = resolve(args.get('--source') || '')
const outputPath = resolve(args.get('--output') || `${root}/data/place-search/place-search-seed-20260920.ndjson`)

if (!args.get('--source')) throw new Error('Use --source <places-audited-1000.json>')

const source = JSON.parse(await readFile(sourcePath, 'utf8'))
if (!Array.isArray(source.places) || source.places.length !== source.sourceCount) throw new Error('Invalid audited place source')

const statusMap = {
  usable_preview: 'usable_preview',
  pending: 'pending_review',
  pending_review: 'pending_review',
  excluded: 'excluded',
}

const records = source.places.map((place) => {
  const status = statusMap[place.status]
  if (!status) throw new Error(`Unknown status ${place.status} for ${place.id}`)
  const selected = place.coordinates?.selected ?? null
  return {
    id: place.id,
    nameKo: place.nameKo,
    nameEn: place.nameEn,
    aliases: place.aliases,
    category: place.category ?? 'unknown',
    placeKind: place.placeKind,
    status,
    searchScope: status === 'usable_preview' ? 'preview' : 'disabled',
    productionApproved: Boolean(place.productionApproved),
    verificationLevel: place.verificationLevel,
    reasons: place.reasons,
    reasonText: place.reasonText,
    warnings: place.warnings,
    classification: place.classification,
    selectedCoordinate: selected ? {
      latitude: selected.latitude,
      longitude: selected.longitude,
      precisionDegrees: selected.precisionDegrees ?? null,
      role: selected.role ?? null,
    } : null,
    coordinateCandidates: (place.coordinates?.candidates ?? []).map((candidate) => ({
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      precisionDegrees: candidate.precisionDegrees ?? null,
      rank: candidate.rank ?? null,
      eligible: Boolean(candidate.eligible),
      qualifiers: candidate.qualifiers ?? {},
      references: candidate.references ?? [],
      regions: candidate.regions ?? {},
    })),
    regions: place.regions,
    sourceProvinceCodes: place.sourceProvinceCodes,
    sourceEndDates: place.sourceEndDates,
    sourceUrl: place.sourceUrl,
    sourceRevision: place.sourceRevision,
    sourceModifiedAt: place.sourceModifiedAt,
    followUp: place.followUp,
  }
})

const counts = records.reduce((result, place) => {
  result[place.status] = (result[place.status] ?? 0) + 1
  return result
}, {})
if (counts.usable_preview !== 595 || counts.pending_review !== 401 || counts.excluded !== 4) {
  throw new Error(`Unexpected quality counts: ${JSON.stringify(counts)}`)
}
if (records.some(place => place.productionApproved)) throw new Error('No collected place is production-approved yet')

const metadata = {
  type: 'dataset',
  datasetId: 'wikidata-place-seed-20260920',
  schemaVersion: source.schemaVersion,
  auditedAt: source.auditedAt,
  asOf: source.asOf,
  sourceHash: source.sourceHash,
  sourceCount: source.sourceCount,
  sourceLicenses: source.sourceLicenses,
  counts,
}

await mkdir(dirname(outputPath), { recursive: true })
const lines = [JSON.stringify(metadata), ...records.map(record => JSON.stringify({ type: 'place', ...record }))]
await writeFile(outputPath, `${lines.join('\n')}\n`)
console.log(JSON.stringify({ outputPath, records: records.length, counts }))
