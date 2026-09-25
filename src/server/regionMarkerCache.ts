import type { ToiletMapItemResponse } from '../api/toilets'
import type { R2BucketLike, R2PutOnlyIf } from './sharedToiletCache'

const SCHEMA = 1
const PREFIX = `region-markers/v${SCHEMA}` // Shared by every WEB deployment and locale.
const FRESH_MS = 30 * 24 * 60 * 60 * 1000
const LEASE_MS = 25_000

type State = 'data' | 'loading' | 'invalidated'
type DistrictRecord = { schema: number; districtCode: string; revision: number; globalRevision: number;
  state: State; storedAt: number; leaseUntil?: number; data?: ToiletMapItemResponse[] }
type GlobalRecord = { schema: number; revision: number }
type Loaded<T> = { record: T | null; etag: string } | null

export type RegionMarkerRead = { toilets: ToiletMapItemResponse[]; source: 'hit' | 'miss' }
export function regionMarkerObjectKey(code: string) { return `${PREFIX}/districts/${code}.json` }
export function regionMarkerGlobalKey() { return `${PREFIX}/global.json` }
function validCode(code: string) { return /^\d{5}$/.test(code) }
function condition(current: Loaded<unknown>): R2PutOnlyIf {
  return current ? { etagMatches: current.etag } : { etagDoesNotMatch: '*' }
}
function validGlobal(value: unknown): GlobalRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as GlobalRecord
  return record.schema === SCHEMA && Number.isSafeInteger(record.revision) && record.revision >= 0 ? record : null
}
function validDistrict(value: unknown, code: string): DistrictRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as DistrictRecord
  if (record.schema !== SCHEMA || record.districtCode !== code
    || !Number.isSafeInteger(record.revision) || record.revision < 0
    || !Number.isSafeInteger(record.globalRevision) || record.globalRevision < 0
    || !Number.isSafeInteger(record.storedAt) || record.storedAt < 0
    || !['data', 'loading', 'invalidated'].includes(record.state)) return null
  if (record.data !== undefined && (!Array.isArray(record.data)
    || record.data.some(item => !item || !Number.isSafeInteger(item.id) || item.id < 1
      || typeof item.name !== 'string' || !Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)))) return null
  if (record.state === 'data' && !record.data) return null
  if (record.state === 'loading' && (!Number.isSafeInteger(record.leaseUntil) || record.leaseUntil! < 0)) return null
  return record
}
async function load<T>(bucket: R2BucketLike, key: string, validate: (value: unknown) => T | null): Promise<Loaded<T>> {
  const object = await bucket.get(key)
  if (!object) return null
  return { etag: object.etag, record: validate(await object.json<unknown>()) }
}
function loadGlobal(bucket: R2BucketLike) { return load(bucket, regionMarkerGlobalKey(), validGlobal) }
function loadDistrict(bucket: R2BucketLike, code: string) {
  return load(bucket, regionMarkerObjectKey(code), value => validDistrict(value, code))
}
async function put(bucket: R2BucketLike, key: string, value: unknown, current: Loaded<unknown>) {
  return bucket.put(key, JSON.stringify(value), { onlyIf: condition(current),
    httpMetadata: { contentType: 'application/json' } })
}

/** One cold request owns the origin read; all others wait for its conditional R2 write. */
export async function readThroughRegionMarkers(options: { bucket: R2BucketLike; districtCode: string;
  fetchOrigin: () => Promise<ToiletMapItemResponse[]>; now?: () => number;
  pause?: (milliseconds: number) => Promise<void> }): Promise<RegionMarkerRead> {
  const { bucket, districtCode, fetchOrigin } = options
  if (!validCode(districtCode)) throw new Error('Invalid district code')
  const now = options.now ?? Date.now
  const pause = options.pause ?? (milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)))
  for (let attempt = 0; attempt < 300; attempt++) {
    const [global, current] = await Promise.all([
      loadGlobal(bucket), loadDistrict(bucket, districtCode),
    ])
    const globalRevision = global?.record?.revision ?? 0
    const record = current?.record
    const sameGeneration = record?.globalRevision === globalRevision
    if (record?.state === 'data' && sameGeneration && record.storedAt + FRESH_MS > now()) {
      if (((await loadGlobal(bucket))?.record?.revision ?? 0) === globalRevision)
        return { toilets: record.data!, source: 'hit' }
      continue
    }
    if (record?.state === 'loading' && sameGeneration && record.leaseUntil! > now()) {
      await pause(100)
      continue
    }
    const lease: DistrictRecord = { schema: SCHEMA, districtCode, revision: (record?.revision ?? 0) + 1,
      globalRevision, state: 'loading', storedAt: now(), leaseUntil: now() + LEASE_MS }
    const acquired = await put(bucket, regionMarkerObjectKey(districtCode), lease, current)
    if (!acquired) continue
    try {
      const data = await fetchOrigin()
      const fresh: DistrictRecord = { schema: SCHEMA, districtCode, revision: lease.revision,
        globalRevision, state: 'data', storedAt: now(), data }
      const written = await put(bucket, regionMarkerObjectKey(districtCode), fresh,
        { record: lease, etag: acquired.etag })
      if (written && ((await loadGlobal(bucket))?.record?.revision ?? 0) === globalRevision)
        return { toilets: data, source: 'miss' }
      // A concurrent invalidation won. Never return an older origin snapshot.
    } catch (error) {
      const invalidated: DistrictRecord = { schema: SCHEMA, districtCode,
        revision: lease.revision, globalRevision, state: 'invalidated', storedAt: now() }
      if (await put(bucket, regionMarkerObjectKey(districtCode), invalidated,
        { record: lease, etag: acquired.etag })) throw error
    }
  }
  throw new Error('Region marker cache contention')
}

async function invalidateDistrict(bucket: R2BucketLike, code: string, now: () => number) {
  if (!validCode(code)) throw new Error('Invalid district code')
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await loadDistrict(bucket, code)
    const record = current?.record
    const next: DistrictRecord = { schema: SCHEMA, districtCode: code, revision: (record?.revision ?? 0) + 1,
      globalRevision: record?.globalRevision ?? 0, state: 'invalidated', storedAt: now() }
    if (await put(bucket, regionMarkerObjectKey(code), next, current)) return
  }
  throw new Error('Region marker invalidation contention')
}

async function advanceGlobal(bucket: R2BucketLike) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await loadGlobal(bucket)
    const next: GlobalRecord = { schema: SCHEMA, revision: (current?.record?.revision ?? 0) + 1 }
    if (await put(bucket, regionMarkerGlobalKey(), next, current)) return
  }
  throw new Error('Region marker global invalidation contention')
}

export async function invalidateRegionMarkers(bucket: R2BucketLike, codes: string[] | null, now = Date.now) {
  if (codes === null) { await advanceGlobal(bucket); return 'global' as const }
  const pending = [...new Set(codes)]
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
    while (cursor < pending.length) await invalidateDistrict(bucket, pending[cursor++], now)
  }))
  return 'scoped' as const
}

export async function getRegionMarkerBucket(): Promise<R2BucketLike | null> {
  if (process.env.CACHE_RUNTIME !== 'workers') return null
  const { getCloudflareContext } = await import('@opennextjs/cloudflare')
  const { env } = await getCloudflareContext({ async: true })
  const bucket = (env as Record<string, unknown>).PUBLIC_TOILET_DATA_CACHE_R2
  if (!bucket) throw new Error('Region marker R2 binding unavailable')
  return bucket as R2BucketLike
}

export async function persistRegionMarkerInvalidation(codes: string[] | null) {
  if (process.env.REGION_MARKER_CACHE_ENABLED !== 'true') return
  const bucket = await getRegionMarkerBucket()
  if (bucket) await invalidateRegionMarkers(bucket, codes)
}
