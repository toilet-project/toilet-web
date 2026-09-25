import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const args = process.argv.slice(2)
const execute = args.includes('--execute')
const baseArg = args.indexOf('--base-url')
const base = baseArg >= 0 ? new URL(args[baseArg + 1]) : null
const productionApproval = args.indexOf('--allow-production')
if (!execute || process.env.MAP_CLUSTER_PREWARM_ENABLED !== 'true'
  || !base || base.protocol !== 'https:' || base.port || base.pathname !== '/'
  || !['geupddong.com', 'preview.geupddong.com'].includes(base.hostname)
  || (base.hostname === 'geupddong.com' && args[productionApproval + 1] !== 'yes')
  || args.some((arg, index) => !['--execute', '--base-url', '--allow-production', 'yes'].includes(arg)
    && index !== baseArg + 1)) throw new Error('Explicit approved site and prewarm gate are required')

const url = new URL('/api/map-clusters', base)
for (const [name, value] of Object.entries({ southLat: 32, northLat: 40,
  westLng: 124, eastLng: 132, zoom: 14 })) url.searchParams.set(name, String(value))

async function read() {
  const response = await fetch(url, { cache: 'no-store',
    headers: { 'User-Agent': 'Geupddong-MapCluster-Prewarm/1.0' }, signal: AbortSignal.timeout(25_000) })
  if (!response.ok) throw new Error(`Cluster prewarm HTTP ${response.status}`)
  const source = response.headers.get('x-map-cluster-cache')
  if (!['hit', 'miss', 'stale'].includes(source)) throw new Error('Missing cluster cache status')
  const payload = await response.json()
  if (payload.meta?.display_type !== 'CLUSTER' || payload.meta.map_level !== 14
    || !Number.isSafeInteger(payload.meta.total_count) || payload.meta.total_count < 10_000
    || !Array.isArray(payload.clusters) || payload.clusters.length < 1)
    throw new Error('Incomplete national cluster snapshot')
  return { source, count: payload.meta.total_count, clusters: payload.clusters.length }
}

const first = await read()
const second = await read()
if (second.source !== 'hit' || first.count !== second.count || first.clusters !== second.clusters)
  throw new Error('Cluster snapshot did not settle to an R2 hit')
const report = { schema: 1, site: base.origin, first, second, checkedAt: new Date().toISOString() }
const path = resolve(`.cache-prewarm/map-clusters-${base.hostname}.json`)
await mkdir(dirname(path), { recursive: true })
await writeFile(path, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ report: path, ...report }))
