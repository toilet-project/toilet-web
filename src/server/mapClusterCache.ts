import { buildClusterBins, sanitizeClusterPoints, validClusterBins,
  type ClusterBin, type ClusterPoint } from '../lib/mapClusters.ts'
import { createHmac } from 'node:crypto'
import type { R2BucketLike, R2PutOnlyIf } from './sharedToiletCache'

const SCHEMA = 1
const KEY = `map-clusters/v${SCHEMA}/national-points.json`
const FRESH_MS = 30 * 24 * 60 * 60 * 1000
const STALE_MS = 37 * 24 * 60 * 60 * 1000
const LEASE_MS = 15_000
const RETRY_MS = 60_000
type State = 'data' | 'loading' | 'invalidated'
type Record = { schema: number; revision: number; state: State; storedAt: number;
  leaseUntil?: number; retryAt?: number; data?: ClusterBin[] }
type Loaded = { record: Record | null; etag: string } | null
export type ClusterSourceRead = { bins: ClusterBin[]; source: 'hit' | 'miss' | 'stale' }

export function mapClusterObjectKey() { return KEY }

function validRecord(value: unknown): Record | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record
  if (record.schema !== SCHEMA || !Number.isSafeInteger(record.revision) || record.revision < 0
    || !Number.isSafeInteger(record.storedAt) || record.storedAt < 0
    || !['data', 'loading', 'invalidated'].includes(record.state)
    || (record.state === 'loading' && (!Number.isSafeInteger(record.leaseUntil) || record.leaseUntil! < 0))
    || (record.retryAt !== undefined && (!Number.isSafeInteger(record.retryAt) || record.retryAt < 0))) return null
  if (record.data !== undefined && !validClusterBins(record.data)) return null
  if (record.state === 'data' && !record.data) return null
  return record
}

async function load(bucket: R2BucketLike): Promise<Loaded> {
  const object = await bucket.get(KEY)
  if (!object) return null
  return { etag: object.etag, record: validRecord(await object.json<unknown>()) }
}

function condition(current: Loaded): R2PutOnlyIf {
  return current ? { etagMatches: current.etag } : { etagDoesNotMatch: '*' }
}

async function put(bucket: R2BucketLike, record: Record, current: Loaded) {
  return bucket.put(KEY, JSON.stringify(record), { onlyIf: condition(current),
    httpMetadata: { contentType: 'application/json' } })
}

export async function fetchClusterSourceOrigin(): Promise<ClusterPoint[]> {
  const origin = process.env.TOILET_API_ORIGIN ?? 'https://api.geupddong.com'
  const secret = process.env.CACHE_REVALIDATION_SECRET
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32)
    throw new Error('Cluster source signing secret unavailable')
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', secret)
    .update(`v1\nGET\n/api/v1/toilets/map-cluster-points\n${timestamp}`, 'utf8').digest('hex')
  const response = await fetch(`${origin.replace(/\/$/, '')}/api/v1/toilets/map-cluster-points`, {
    cache: 'no-store', signal: AbortSignal.timeout(12_000),
    headers: { 'X-Map-Cluster-Timestamp': timestamp, 'X-Map-Cluster-Signature': signature },
  })
  // Preview can warm real data before the additive API endpoint reaches production.
  // Production never performs this expensive full-marker fallback.
  if ([400, 404].includes(response.status) && process.env.MAP_CLUSTER_LEGACY_SOURCE_FALLBACK === 'true') {
    const query = new URLSearchParams({ southLat: '32', northLat: '40', westLng: '124', eastLng: '132',
      zoom: '8', includeList: 'true' })
    const legacy = await fetch(`${origin.replace(/\/$/, '')}/api/v1/toilets?${query}`, {
      cache: 'no-store', signal: AbortSignal.timeout(20_000),
    })
    if (!legacy.ok) throw new Error(`Cluster preview source HTTP ${legacy.status}`)
    const payload = await legacy.json() as { meta?: { display_type?: string; total_count?: number };
      toilets?: Array<{ latitude: number; longitude: number }> }
    if (payload.meta?.display_type !== 'MARKER' || !Array.isArray(payload.toilets)
      || payload.toilets.length !== payload.meta.total_count)
      throw new Error('Incomplete cluster preview source')
    return sanitizeClusterPoints(payload.toilets.map(item => [item.latitude, item.longitude]))
  }
  if (!response.ok) throw new Error(`Cluster source origin HTTP ${response.status}`)
  return sanitizeClusterPoints(await response.json())
}

export async function readThroughMapClusterCache(options: { bucket: R2BucketLike;
  fetchOrigin?: () => Promise<ClusterPoint[]>; now?: () => number;
  pause?: (milliseconds: number) => Promise<void> }): Promise<ClusterSourceRead> {
  const { bucket } = options
  const now = options.now ?? Date.now
  const fetchOrigin = options.fetchOrigin ?? fetchClusterSourceOrigin
  const pause = options.pause ?? (milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)))
  for (let attempt = 0; attempt < 180; attempt++) {
    const current = await load(bucket)
    const record = current?.record
    if (record?.state === 'data' && record.storedAt + FRESH_MS > now())
      return { bins: record.data!, source: 'hit' }
    if (record?.state === 'data' && record.data && record.storedAt + STALE_MS > now()
      && record.retryAt && record.retryAt > now())
      return { bins: record.data, source: 'stale' }
    if (record?.state === 'loading' && record.leaseUntil! > now()) {
      if (record.data && record.storedAt + STALE_MS > now())
        return { bins: record.data, source: 'stale' }
      await pause(100)
      continue
    }
    const stale = record?.state === 'data' && record.data && record.storedAt + STALE_MS > now()
      ? record.data : undefined
    const lease: Record = { schema: SCHEMA, revision: (record?.revision ?? 0) + 1,
      state: 'loading', storedAt: record?.storedAt ?? now(), leaseUntil: now() + LEASE_MS,
      ...(stale ? { data: stale } : {}) }
    const acquired = await put(bucket, lease, current)
    if (!acquired) continue
    try {
      const points = sanitizeClusterPoints(await fetchOrigin())
      const bins = buildClusterBins(points)
      const fresh: Record = { schema: SCHEMA, revision: lease.revision,
        state: 'data', storedAt: now(), data: bins }
      if (await put(bucket, fresh, { record: lease, etag: acquired.etag }))
        return { bins, source: 'miss' }
      // A change was committed while the origin read was in flight.
    } catch (error) {
      const fallback: Record = stale
        ? { schema: SCHEMA, revision: lease.revision, state: 'data',
          storedAt: lease.storedAt, retryAt: now() + RETRY_MS, data: stale }
        : { schema: SCHEMA, revision: lease.revision, state: 'invalidated', storedAt: now() }
      if (!await put(bucket, fallback, { record: lease, etag: acquired.etag })) continue
      if (stale) return { bins: stale, source: 'stale' }
      throw error
    }
  }
  throw new Error('Map cluster cache contention')
}

export async function invalidateMapClusterCache(bucket: R2BucketLike, now = Date.now) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await load(bucket)
    const invalidated: Record = { schema: SCHEMA, revision: (current?.record?.revision ?? 0) + 1,
      state: 'invalidated', storedAt: now() }
    if (await put(bucket, invalidated, current)) return
  }
  throw new Error('Map cluster invalidation contention')
}
