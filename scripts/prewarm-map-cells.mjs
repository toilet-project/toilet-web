import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const GRID = 20
const BOUNDS = { minX: 124 * GRID, maxX: 132 * GRID, minY: 32 * GRID, maxY: 40 * GRID }
const sleep = milliseconds => new Promise(done => setTimeout(done, milliseconds))

function options(values) {
  const result = {}
  for (let index = 0; index < values.length; index++) {
    const name = values[index]
    if (!name.startsWith('--')) throw new Error(`Unexpected argument: ${name}`)
    if (name === '--execute') { result.execute = true; continue }
    const value = values[++index]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`)
    result[name.slice(2)] = value
  }
  return result
}

function integer(value, name, maximum) {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) throw new Error(`Invalid ${name}`)
  return number
}

function cellId(cell) { return `${cell.y}:${cell.x}` }
function validCell(cell) {
  return cell.x >= BOUNDS.minX && cell.x < BOUNDS.maxX
    && cell.y >= BOUNDS.minY && cell.y < BOUNDS.maxY
}

function inventory(clusters, scope) {
  const occupied = new Map()
  for (const cluster of clusters) {
    const cell = { x: Math.floor(cluster.longitude * GRID), y: Math.floor(cluster.latitude * GRID) }
    if (!validCell(cell) || !Number.isSafeInteger(cluster.count) || cluster.count < 1)
      throw new Error('Invalid national cluster inventory')
    occupied.set(cellId(cell), { ...cell, count: cluster.count })
  }
  const cells = new Map(occupied)
  if (scope === 'halo') {
    for (const source of occupied.values()) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cell = { x: source.x + dx, y: source.y + dy }
        if (validCell(cell) && !cells.has(cellId(cell))) cells.set(cellId(cell), { ...cell, count: 0 })
      }
    }
  }
  return [...cells.values()].sort((a, b) => b.count - a.count || a.y - b.y || a.x - b.x)
}

function cellUrl(baseUrl, cell) {
  // Keep the upper edge inside the cell; cellsForBounds includes exact upper edges.
  const query = new URLSearchParams({
    zoom: '8', southLat: String(cell.y / GRID), northLat: String((cell.y + 1) / GRID - 1e-7),
    westLng: String(cell.x / GRID), eastLng: String((cell.x + 1) / GRID - 1e-7),
  })
  return `${baseUrl}/api/map-area?${query}`
}

async function save(path, report) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(report)}\n`)
}

const args = options(process.argv.slice(2))
const allowed = new Set(['execute', 'base-url', 'scope', 'rps', 'concurrency', 'limit',
  'checkpoint', 'allow-production', 'refresh'])
for (const name of Object.keys(args)) if (!allowed.has(name)) throw new Error(`Unknown option: ${name}`)
if (args.refresh && args.refresh !== 'yes') throw new Error('--refresh requires yes')
if (!args.execute || process.env.MAP_CELL_PREWARM_ENABLED !== 'true')
  throw new Error('Prewarm requires --execute and MAP_CELL_PREWARM_ENABLED=true')
const baseUrl = new URL(args['base-url'] ?? 'https://preview.geupddong.com')
if (baseUrl.protocol !== 'https:' || baseUrl.port || baseUrl.username || baseUrl.password || baseUrl.pathname !== '/'
  || !['preview.geupddong.com', 'geupddong.com'].includes(baseUrl.hostname))
  throw new Error('Only the configured preview or production site can be prewarmed')
if (baseUrl.hostname === 'geupddong.com' && args['allow-production'] !== 'yes')
  throw new Error('Production requires --allow-production yes')
const site = baseUrl.origin
const scope = args.scope ?? 'halo'
if (!['occupied', 'halo'].includes(scope)) throw new Error('Scope must be occupied or halo')
const rps = integer(args.rps ?? 2, 'rps', 4)
const concurrency = integer(args.concurrency ?? 2, 'concurrency', 4)
const limit = args.limit ? integer(args.limit, 'limit', 25600) : Infinity
const checkpointPath = resolve(args.checkpoint ?? `.cache-prewarm/map-cells-${baseUrl.hostname}.json`)
const clusterResponse = await fetch('https://api.geupddong.com/api/v1/toilets?zoom=12&includeList=false&southLat=32&northLat=40&westLng=124&eastLng=132', {
  signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Geupddong-MapCell-Prewarm/1.0' },
})
if (!clusterResponse.ok) throw new Error(`National cluster inventory: HTTP ${clusterResponse.status}`)
const national = await clusterResponse.json()
if (national.meta?.display_type !== 'CLUSTER' || !Number.isSafeInteger(national.meta.total_count)
  || national.meta.total_count < 1 || !Array.isArray(national.clusters) || !national.clusters.length)
  throw new Error('Invalid national cluster inventory')
const cells = inventory(national.clusters, scope).slice(0, limit)
let previous = null
try { previous = JSON.parse(await readFile(checkpointPath, 'utf8')) } catch (error) {
  if (error.code !== 'ENOENT') throw error
}
// --refresh yes starts a new pass; the default checkpoint resumes an interrupted pass.
const report = args.refresh !== 'yes' && previous?.schema === 1 && previous.site === site && previous.scope === scope
  ? previous : { schema: 1, site, scope, startedAt: new Date().toISOString(), succeeded: {}, failed: {} }
report.targetCount = cells.length
report.facilities = national.meta.total_count
report.inventoryCells = national.clusters.length
const pending = cells.filter(cell => !report.succeeded[cellId(cell)])
console.log(JSON.stringify({ type: 'start', site, scope, target: cells.length, pending: pending.length,
  occupied: national.clusters.length, facilities: national.meta.total_count, rps, concurrency, checkpointPath }))
let index = 0, nextAt = Date.now(), completed = 0, consecutiveFailures = 0, stopped = false
async function worker() {
  while (!stopped && index < pending.length) {
    const cell = pending[index++]
    const scheduled = Math.max(nextAt, Date.now())
    nextAt = scheduled + 1000 / rps
    await sleep(Math.max(0, scheduled - Date.now()))
    let errorMessage = ''
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(cellUrl(site, cell), {
          signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Geupddong-MapCell-Prewarm/1.0' },
        })
        if (!response.ok || response.headers.get('x-map-cells') !== '1')
          throw new Error(`HTTP ${response.status}, X-Map-Cells=${response.headers.get('x-map-cells')}`)
        const payload = await response.json()
        if (payload.meta?.display_type !== 'MARKER' || !Array.isArray(payload.toilets))
          throw new Error('Invalid marker payload')
        const originReads = Number(response.headers.get('x-map-origin-reads'))
        if (![0, 1].includes(originReads)) throw new Error('Missing origin read count')
        report.succeeded[cellId(cell)] = { markers: payload.toilets.length, originReads,
          // The current R2 wrapper differs by less than 10 bytes from this value.
          estimatedBytes: Buffer.byteLength(JSON.stringify({ schema: 1, cell: cellId(cell), revision: 1,
            globalRevision: 0, state: 'data', storedAt: Date.now(), data: payload.toilets })) }
        delete report.failed[cellId(cell)]
        consecutiveFailures = 0
        errorMessage = ''
        break
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error)
        if (attempt < 2) await sleep(1000 * (attempt + 1))
      }
    }
    if (errorMessage) {
      report.failed[cellId(cell)] = errorMessage
      consecutiveFailures++
      if (consecutiveFailures >= 8) stopped = true
    }
    completed++
    if (completed % 100 === 0 || stopped || completed === pending.length) {
      report.updatedAt = new Date().toISOString()
      await save(checkpointPath, report)
      console.log(JSON.stringify({ type: 'progress', completed, target: pending.length,
        success: Object.keys(report.succeeded).length, failed: Object.keys(report.failed).length,
        estimatedBytes: Object.values(report.succeeded).reduce((sum, value) => sum + value.estimatedBytes, 0),
        stopped }))
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker))
report.updatedAt = new Date().toISOString()
await save(checkpointPath, report)
console.log(JSON.stringify({ type: stopped || Object.keys(report.failed).length ? 'incomplete' : 'complete',
  target: cells.length, success: Object.keys(report.succeeded).length,
  failed: Object.keys(report.failed).length, stopped, checkpointPath }))
if (stopped || Object.keys(report.failed).length) process.exitCode = 1
