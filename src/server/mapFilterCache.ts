import { createHmac } from 'node:crypto'
import { sanitizeMapFilterPoints, completeFilterMarker, type MapFilterPoint } from '../lib/mapFilters.ts'
import type { ScopedToiletCacheEvent } from './cacheRevalidation'
import { getMapCellBucket, invalidateMapCells, readThroughMapCell } from './mapCellCache.ts'
import type { R2BucketLike, R2ObjectBodyLike } from './sharedToiletCache'

// Isolate gender-aware facts: old combined flags cannot imply a missing male/female stall.
const KEY = 'map-filter-points/v3/national-points.json.gz'
export const MAP_FILTER_PREVIEW_SOURCE_KEY = 'map-filter-preview/v3/source.json'
const FRESH_MS = 30 * 24 * 60 * 60 * 1000
const LEASE_MS = 15_000
const HOT_MS = 30_000
type SourceRecord = { schema: 3; revision: number; state: 'data' | 'loading' | 'invalidated';
  storedAt: number; leaseUntil?: number; retryAt?: number; points?: MapFilterPoint[] }
type Loaded = { etag: string; record: SourceRecord | null } | null
export type MapFilterSource = { points: MapFilterPoint[]; sourceDate?: string; sourceRevision?: string;
  source: 'hit' | 'miss' | 'preview' }
const hot = new WeakMap<R2BucketLike, { at: number; loaded: Loaded }>()
const previewHot = new WeakMap<R2BucketLike, { at: number; etag: string; value: MapFilterSource }>()

export function mapFilterSourceKey() { return KEY }
export function mapFilterPreviewEnabled() {
  if (process.env.MAP_FILTER_PREVIEW_SOURCE_ENABLED !== 'true') return false
  if (process.env.SITE_INDEXABLE !== 'false') throw new Error('Preview filter source is not allowed on an indexable site')
  return true
}

// Reuse the proven cell lease/generation algorithm in an isolated namespace.
// No v1 object is read, overwritten or invalidated by a filtered request.
export function mapFilterCellBucket(bucket: R2BucketLike, previewSourceDate?: string): R2BucketLike {
  const key = (original: string) => {
    if (!original.startsWith('map-cells/v1/')) throw new Error('Invalid filter cell key')
    return original.replace('map-cells/v1/', 'map-cells/v4/')
  }
  return {
    async get(original) {
      const found = await bucket.get(key(original))
      if (!found) return null
      return { etag: found.etag, arrayBuffer: () => found.arrayBuffer(), async json<T>() {
        const value = await found.json<{ data?: Array<{ filterFlags?: number; filterSchema?: number }>; previewSourceDate?: string }>()
        // Never silently accept old marker payloads without the new attribute contract.
        return ((value?.data?.some(item => !completeFilterMarker(item))
          || (previewSourceDate !== undefined && value?.previewSourceDate !== previewSourceDate)) ? null : value) as T
      } }
    },
    put: (original, value, options) => bucket.put(key(original), previewSourceDate && typeof value === 'string'
      ? JSON.stringify({ ...JSON.parse(value), previewSourceDate }) : value, options),
  }
}

export async function readThroughFilterCell(options: Parameters<typeof readThroughMapCell>[0] & { previewSourceDate?: string }) {
  const result = await readThroughMapCell({ ...options, bucket: mapFilterCellBucket(options.bucket, options.previewSourceDate) })
  if (result.toilets.some(item => !completeFilterMarker(item))) throw new Error('Incomplete map filter attributes')
  return result
}

function validRecord(value: unknown): SourceRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as SourceRecord
  if (record.schema !== 3 || !Number.isSafeInteger(record.revision) || record.revision < 0
    || !Number.isSafeInteger(record.storedAt) || record.storedAt < 0
    || !['data', 'loading', 'invalidated'].includes(record.state)
    || (record.state === 'loading' && !Number.isSafeInteger(record.leaseUntil))
    || (record.retryAt !== undefined && !Number.isSafeInteger(record.retryAt))) return null
  if (record.state === 'data') {
    try { record.points = sanitizeMapFilterPoints(record.points) } catch { return null }
  }
  return record
}

async function readRecord(object: R2ObjectBodyLike): Promise<SourceRecord | null> {
  const body = new Blob([await object.arrayBuffer()]).stream().pipeThrough(new DecompressionStream('gzip'))
  return validRecord(JSON.parse(await new Response(body).text()))
}

async function load(bucket: R2BucketLike, useHot = true): Promise<Loaded> {
  const current = hot.get(bucket)
  if (useHot && current && Date.now() - current.at < HOT_MS) return current.loaded
  const head = (bucket as R2BucketLike & { head?: (key: string) => Promise<{ etag: string } | null> }).head
  if (useHot && head && current?.loaded?.record?.state === 'data') {
    const metadata = await head.call(bucket, KEY)
    if (metadata?.etag === current.loaded.etag) {
      hot.set(bucket, { ...current, at: Date.now() })
      return current.loaded
    }
  }
  const object = await bucket.get(KEY)
  const loaded = object ? { etag: object.etag, record: await readRecord(object) } : null
  hot.set(bucket, { at: Date.now(), loaded })
  return loaded
}

async function put(bucket: R2BucketLike, record: SourceRecord, current: Loaded) {
  const body = new Blob([JSON.stringify(record)]).stream().pipeThrough(new CompressionStream('gzip'))
  const bytes = new Uint8Array(await new Response(body).arrayBuffer())
  const stored = await bucket.put(KEY, bytes, { onlyIf: current ? { etagMatches: current.etag } : { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/gzip' } })
  if (stored) hot.set(bucket, { at: Date.now(), loaded: { etag: stored.etag, record } })
  else hot.delete(bucket)
  return stored
}

export async function fetchMapFilterSourceOrigin(): Promise<MapFilterPoint[]> {
  const origin = process.env.TOILET_API_ORIGIN ?? 'https://api.geupddong.com'
  const secret = process.env.CACHE_REVALIDATION_SECRET
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) throw new Error('Map filter source signing secret unavailable')
  const path = '/api/v1/toilets/map-filter-points'
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', secret).update(`v1\nGET\n${path}\n${timestamp}`, 'utf8').digest('hex')
  const response = await fetch(`${origin.replace(/\/$/, '')}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(12_000),
    headers: { 'X-Map-Cluster-Timestamp': timestamp, 'X-Map-Cluster-Signature': signature } })
  if (!response.ok) throw new Error(`Map filter source HTTP ${response.status}`)
  if (response.headers.get('X-Map-Filter-Schema') !== '3') throw new Error('Map filter source contract not ready')
  return sanitizeMapFilterPoints(await response.json())
}

export async function readPreviewMapFilterSource(bucket: R2BucketLike): Promise<MapFilterSource> {
  if (!mapFilterPreviewEnabled()) throw new Error('Preview filter source disabled')
  const cached = previewHot.get(bucket)
  if (cached && Date.now() - cached.at < HOT_MS) return cached.value
  const head = (bucket as R2BucketLike & { head?: (key: string) => Promise<{ etag: string } | null> }).head
  if (cached && head) {
    const metadata = await head.call(bucket, MAP_FILTER_PREVIEW_SOURCE_KEY)
    if (metadata?.etag === cached.etag) {
      previewHot.set(bucket, { ...cached, at: Date.now() })
      return cached.value
    }
  }
  const object = await bucket.get(MAP_FILTER_PREVIEW_SOURCE_KEY)
  if (!object) throw new Error('Preview filter source unavailable')
  if (cached?.etag === object.etag) {
    previewHot.set(bucket, { ...cached, at: Date.now() })
    return cached.value
  }
  const raw = await object.json<{ schema: number; exportedAt: string; points: unknown }>()
  if (raw.schema !== 3 || typeof raw.exportedAt !== 'string' || !Number.isFinite(Date.parse(raw.exportedAt)))
    throw new Error('Invalid preview filter snapshot')
  const value: MapFilterSource = { points: sanitizeMapFilterPoints(raw.points), sourceDate: raw.exportedAt,
    sourceRevision: `${raw.exportedAt}:${object.etag}`, source: 'preview' }
  previewHot.set(bucket, { at: Date.now(), etag: object.etag, value })
  return value
}

export async function readThroughMapFilterSource(options: { bucket: R2BucketLike; fetchOrigin?: () => Promise<MapFilterPoint[]>;
  now?: () => number; pause?: (ms: number) => Promise<void> }): Promise<MapFilterSource> {
  const { bucket } = options
  const now = options.now ?? Date.now
  const pause = options.pause ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)))
  for (let attempt = 0; attempt < 150; attempt++) {
    const current = await load(bucket, attempt === 0)
    const record = current?.record
    if (record?.state === 'data' && record.storedAt + FRESH_MS > now())
      return { points: record.points!, source: 'hit' }
    if (record?.state === 'invalidated' && record.retryAt && record.retryAt > now())
      throw new Error('Map filter source retry deferred')
    if (record?.state === 'loading' && record.leaseUntil! > now()) { await pause(100); continue }
    const lease: SourceRecord = { schema: 3, revision: (record?.revision ?? 0) + 1,
      state: 'loading', storedAt: now(), leaseUntil: now() + LEASE_MS }
    const acquired = await put(bucket, lease, current)
    if (!acquired) continue
    try {
      const points = sanitizeMapFilterPoints(await (options.fetchOrigin ?? fetchMapFilterSourceOrigin)())
      const fresh: SourceRecord = { schema: 3, revision: lease.revision, state: 'data', storedAt: now(), points }
      if (await put(bucket, fresh, { record: lease, etag: acquired.etag })) return { points, source: 'miss' }
    } catch (error) {
      if (!await put(bucket, { schema: 3, revision: lease.revision, state: 'invalidated', storedAt: now(), retryAt: now() + 60_000 },
        { record: lease, etag: acquired.etag })) continue
      // Do not show an unfiltered/stale national source after a visibility change.
      throw error
    }
  }
  throw new Error('Map filter source cache contention')
}

export async function invalidateMapFilterSource(bucket: R2BucketLike, now = Date.now) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await load(bucket, false)
    if (await put(bucket, { schema: 3, revision: (current?.record?.revision ?? 0) + 1,
      state: 'invalidated', storedAt: now() }, current)) return
  }
  throw new Error('Map filter source invalidation contention')
}

export async function persistMapFilterInvalidation(events: ScopedToiletCacheEvent[] | null) {
  if (process.env.MAP_FILTERS_ENABLED !== 'true' || mapFilterPreviewEnabled()) return
  const bucket = await getMapCellBucket()
  if (!bucket) return
  const scope = events ?? [{ toiletId: 1, revision: 1, action: 'UPSERT' as const, catalogChanged: true,
    regionScopeComplete: false, regionBounds: null }]
  await Promise.all([invalidateMapCells(mapFilterCellBucket(bucket), scope), invalidateMapFilterSource(bucket)])
}
