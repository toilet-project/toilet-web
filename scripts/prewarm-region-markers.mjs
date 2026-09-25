import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import districts from '../data/regions/sgg.json' with { type: 'json' }

const sleep = milliseconds => new Promise(done => setTimeout(done, milliseconds))
const args = {}
for (let index = 0; index < process.argv.slice(2).length; index++) {
  const name = process.argv.slice(2)[index]
  if (!name.startsWith('--')) throw new Error(`Unexpected argument: ${name}`)
  if (name === '--execute') { args.execute = true; continue }
  const value = process.argv.slice(2)[++index]
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`)
  args[name.slice(2)] = value
}
if (!args.execute || process.env.REGION_MARKER_PREWARM_ENABLED !== 'true')
  throw new Error('Prewarm requires --execute and REGION_MARKER_PREWARM_ENABLED=true')
const allowed = new Set(['execute', 'base-url', 'rps', 'concurrency', 'checkpoint', 'refresh', 'allow-production', 'limit'])
for (const name of Object.keys(args)) if (!allowed.has(name)) throw new Error(`Unknown option: ${name}`)
const base = new URL(args['base-url'] ?? 'https://preview.geupddong.com')
if (base.protocol !== 'https:' || base.port || base.username || base.password || base.pathname !== '/'
  || !['preview.geupddong.com', 'geupddong.com'].includes(base.hostname))
  throw new Error('Only configured preview or production site can be prewarmed')
if (base.hostname === 'geupddong.com' && args['allow-production'] !== 'yes')
  throw new Error('Production requires --allow-production yes')
function bounded(value, name, maximum) {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) throw new Error(`Invalid ${name}`)
  return result
}
const rps = bounded(args.rps ?? 2, 'rps', 2)
const concurrency = bounded(args.concurrency ?? 2, 'concurrency', 2)
const codes = districts.features.map(feature => feature.properties.sgg).sort()
const target = args.limit ? codes.slice(0, bounded(args.limit, 'limit', codes.length)) : codes
const checkpoint = resolve(args.checkpoint ?? `.cache-prewarm/region-markers-${base.hostname}.json`)
let previous = null
try { previous = JSON.parse(await readFile(checkpoint, 'utf8')) } catch (error) {
  if (error.code !== 'ENOENT') throw error
}
const report = args.refresh !== 'yes' && previous?.schema === 1 && previous.site === base.origin
  ? previous : { schema: 1, site: base.origin, startedAt: new Date().toISOString(), succeeded: {}, failed: {} }
report.targetCount = target.length
const pending = target.filter(code => !report.succeeded[code])
console.log(JSON.stringify({ type: 'start', site: base.origin, target: target.length, pending: pending.length, rps, concurrency }))
let index = 0, nextAt = Date.now(), failures = 0, lastSave = Promise.resolve()
function save() {
  lastSave = lastSave.then(async () => {
    await mkdir(dirname(checkpoint), { recursive: true })
    const temporary = `${checkpoint}.tmp`
    await writeFile(temporary, `${JSON.stringify(report)}\n`)
    await rename(temporary, checkpoint)
  })
  return lastSave
}
async function worker() {
  while (index < pending.length && failures < 5) {
    const code = pending[index++]
    const scheduled = nextAt
    nextAt += 1000 / rps
    await sleep(Math.max(0, scheduled - Date.now()))
    try {
      const response = await fetch(`${base.origin}/api/region-markers/${code}`, {
        signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'Geupddong-Region-Marker-Prewarm/1.0' },
      })
      if (!response.ok || !['hit', 'miss'].includes(response.headers.get('x-region-marker-cache')))
        throw new Error(`HTTP ${response.status}, cache=${response.headers.get('x-region-marker-cache')}`)
      const body = await response.json()
      if (!Number.isSafeInteger(body.count) || body.count < 0
        || !Number.isSafeInteger(body.payloadBytes) || body.payloadBytes < 0) throw new Error('Invalid marker inventory')
      report.succeeded[code] = { count: body.count, payloadBytes: body.payloadBytes,
        source: response.headers.get('x-region-marker-cache') }
      delete report.failed[code]
    } catch (error) {
      failures++
      report.failed[code] = String(error)
    }
    if (index % 16 === 0 || failures) await save()
  }
}
await Promise.all(Array.from({ length: concurrency }, worker))
report.finishedAt = new Date().toISOString()
await save()
console.log(JSON.stringify({ type: 'done', site: base.origin, target: target.length,
  succeeded: Object.keys(report.succeeded).length, failed: Object.keys(report.failed).length,
  originReads: Object.values(report.succeeded).filter(row => row.source === 'miss').length,
  payloadBytes: Object.values(report.succeeded).reduce((sum, row) => sum + (row.payloadBytes ?? 0), 0),
  checkpoint }))
if (Object.keys(report.failed).length) process.exitCode = 1
