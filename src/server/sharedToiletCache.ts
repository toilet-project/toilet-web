import type { ToiletDetailResponse } from '../api/toilets'

export const SHARED_TOILET_CACHE_SCHEMA = 1
export const SHARED_TOILET_CACHE_PREFIX = `public-toilets/v${SHARED_TOILET_CACHE_SCHEMA}`
const DEFAULT_FRESH_SECONDS = 3600
const DEFAULT_STALE_SECONDS = 21_600
const DEFAULT_NEGATIVE_SECONDS = 300

export type ToiletCacheAction = 'UPSERT' | 'DELETE' | 'PRIVATE'
export type ToiletCacheEvent = { toiletId: number; revision: number; action: ToiletCacheAction; catalogChanged: boolean }
type CacheState = 'data' | 'negative' | 'invalidated' | 'deleted'
export type SharedToiletRecord = {
  schema: number; toiletId: number; revision: number; state: CacheState; storedAt: number
  freshUntil?: number; staleUntil?: number; data?: ToiletDetailResponse
}
export type R2ObjectBodyLike = { etag: string; json<T>(): Promise<T> }
export type R2PutOnlyIf = { etagMatches?: string; etagDoesNotMatch?: string } | Headers
export type R2BucketLike = {
  get(key: string): Promise<R2ObjectBodyLike | null>
  put(key: string, value: string, options?: { onlyIf?: R2PutOnlyIf; httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<{ etag: string } | null>
}
type Loaded = { record: SharedToiletRecord | null; etag: string } | null

export function sharedToiletCacheKey(id: number) { return `${SHARED_TOILET_CACHE_PREFIX}/toilets/${id}.json` }
function integerSetting(name: string, fallback: number, minimum: number, maximum: number) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`Invalid ${name}`)
  return parsed
}
function cacheTiming() {
  return {
    fresh: integerSetting('SHARED_TOILET_CACHE_FRESH_SECONDS', DEFAULT_FRESH_SECONDS, 60, 86_400),
    stale: integerSetting('SHARED_TOILET_CACHE_STALE_SECONDS', DEFAULT_STALE_SECONDS, 60, 604_800),
    negative: integerSetting('SHARED_TOILET_CACHE_NEGATIVE_SECONDS', DEFAULT_NEGATIVE_SECONDS, 10, 3600),
  }
}
function optionalString(value: unknown) { return value == null ? '' : String(value) }
function nullableString(value: unknown) { return value == null ? null : String(value) }
function count(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Invalid toilet count')
  return parsed
}
function coordinate(value: unknown) {
  if (value == null) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error('Invalid toilet coordinate')
  return parsed
}

// Copy only the public detail contract. Extra origin fields can never leak into shared R2.
export function sanitizePublicToiletDetail(value: unknown, expectedId: number): ToiletDetailResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid toilet detail response')
  const input = value as Record<string, unknown>
  if (input.id !== expectedId || typeof input.name !== 'string' || !input.name.trim()) throw new Error('Invalid toilet detail response')
  const sourceRegion = input.region && typeof input.region === 'object' && !Array.isArray(input.region)
    ? input.region as Record<string, unknown> : null
  const region = sourceRegion ? {
    sidoName: nullableString(sourceRegion.sidoName), sidoCode: nullableString(sourceRegion.sidoCode),
    sigunguName: nullableString(sourceRegion.sigunguName), sigunguCode: nullableString(sourceRegion.sigunguCode),
    cityName: nullableString(sourceRegion.cityName), districtName: nullableString(sourceRegion.districtName),
  } : null
  return {
    id: expectedId, name: input.name, toiletType: optionalString(input.toiletType),
    roadAddress: optionalString(input.roadAddress), jibunAddress: optionalString(input.jibunAddress),
    latitude: coordinate(input.latitude), longitude: coordinate(input.longitude), region,
    maleToiletCount: count(input.maleToiletCount), maleUrinalCount: count(input.maleUrinalCount),
    maleDisabledToiletCount: count(input.maleDisabledToiletCount), maleDisabledUrinalCount: count(input.maleDisabledUrinalCount),
    maleChildToiletCount: count(input.maleChildToiletCount), maleChildUrinalCount: count(input.maleChildUrinalCount),
    femaleToiletCount: count(input.femaleToiletCount), femaleDisabledToiletCount: count(input.femaleDisabledToiletCount),
    femaleChildToiletCount: count(input.femaleChildToiletCount), agencyName: optionalString(input.agencyName),
    phoneNumber: optionalString(input.phoneNumber), openTime: optionalString(input.openTime),
    openTimeDetail: optionalString(input.openTimeDetail), installationDate: optionalString(input.installationDate),
    hasEmergencyBell: optionalString(input.hasEmergencyBell), emergencyBellLocation: optionalString(input.emergencyBellLocation),
    hasCctv: optionalString(input.hasCctv), hasDiaperTable: optionalString(input.hasDiaperTable),
    diaperTableLocation: optionalString(input.diaperTableLocation), dataBaseDate: optionalString(input.dataBaseDate),
    dataSource: optionalString(input.dataSource),
  }
}

function validRecord(value: unknown, expectedId: number): SharedToiletRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as SharedToiletRecord
  if (record.schema !== SHARED_TOILET_CACHE_SCHEMA || record.toiletId !== expectedId
    || !Number.isSafeInteger(record.revision) || record.revision < 0
    || !['data', 'negative', 'invalidated', 'deleted'].includes(record.state)
    || !Number.isSafeInteger(record.storedAt) || record.storedAt < 0) return null
  try {
    if (record.state === 'data') {
      if (!Number.isSafeInteger(record.freshUntil) || !Number.isSafeInteger(record.staleUntil) || record.staleUntil! < record.freshUntil!) return null
      record.data = sanitizePublicToiletDetail(record.data, expectedId)
    }
    if (record.state === 'negative' && !Number.isSafeInteger(record.freshUntil)) return null
    return record
  } catch { return null }
}
async function load(bucket: R2BucketLike, id: number): Promise<Loaded> {
  const object = await bucket.get(sharedToiletCacheKey(id))
  if (!object) return null
  const record = validRecord(await object.json<unknown>(), id)
  // Keep the ETag of an incompatible or corrupt object so a valid origin
  // response can replace it conditionally instead of retrying forever.
  return { record, etag: object.etag }
}
function condition(current: Loaded): R2PutOnlyIf {
  return current ? { etagMatches: current.etag } : new Headers({ 'If-None-Match': '*' })
}
async function put(bucket: R2BucketLike, record: SharedToiletRecord, current: Loaded) {
  return bucket.put(sharedToiletCacheKey(record.toiletId), JSON.stringify(record), {
    onlyIf: condition(current), httpMetadata: { contentType: 'application/json' },
    customMetadata: { schema: String(record.schema), revision: String(record.revision), state: record.state },
  })
}
function cachedValue(record: SharedToiletRecord, now: number) {
  if (record.state === 'data' && record.freshUntil! > now) return { hit: true as const, value: record.data! }
  if (record.state === 'negative' && record.freshUntil! > now) return { hit: true as const, value: null }
  if (record.state === 'deleted') return { hit: true as const, value: null }
  return { hit: false as const }
}

export async function readThroughSharedToiletCache(options: { bucket: R2BucketLike; toiletId: number; fetchOrigin: () => Promise<ToiletDetailResponse | null>; now?: () => number }) {
  const now = options.now ?? Date.now
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let current: Loaded
    try { current = await load(options.bucket, options.toiletId) }
    catch { return options.fetchOrigin() }
    if (current?.record) {
      const cached = cachedValue(current.record, now())
      if (cached.hit) return cached.value
    }
    let origin: ToiletDetailResponse | null
    try { origin = await options.fetchOrigin() }
    catch (error) {
      if (current?.record?.state === 'data' && current.record.staleUntil! > now()) return current.record.data!
      throw error
    }
    const timestamp = now()
    const timing = cacheTiming()
    const revision = current?.record?.revision ?? 0
    const record: SharedToiletRecord = origin ? {
      schema: SHARED_TOILET_CACHE_SCHEMA, toiletId: options.toiletId, revision, state: 'data', storedAt: timestamp,
      freshUntil: timestamp + timing.fresh * 1000, staleUntil: timestamp + timing.stale * 1000,
      data: sanitizePublicToiletDetail(origin, options.toiletId),
    } : {
      schema: SHARED_TOILET_CACHE_SCHEMA, toiletId: options.toiletId, revision, state: 'negative', storedAt: timestamp,
      freshUntil: timestamp + timing.negative * 1000,
    }
    try { if (await put(options.bucket, record, current)) return origin }
    catch { return origin }
  }
  const winner = await load(options.bucket, options.toiletId)
  if (winner?.record) {
    const cached = cachedValue(winner.record, now())
    if (cached.hit) return cached.value
  }
  throw new Error('Shared toilet cache changed during refresh')
}

function eventState(action: ToiletCacheAction): CacheState { return action === 'UPSERT' ? 'invalidated' : 'deleted' }
export async function applySharedToiletInvalidation(bucket: R2BucketLike, event: ToiletCacheEvent, now = Date.now) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await load(bucket, event.toiletId)
    if (current?.record && current.record.revision > event.revision) return
    if (current?.record && current.record.revision === event.revision
      && (event.action === 'UPSERT' || current.record.state === 'deleted')) return
    const record: SharedToiletRecord = {
      schema: SHARED_TOILET_CACHE_SCHEMA, toiletId: event.toiletId, revision: event.revision,
      state: eventState(event.action), storedAt: now(),
    }
    if (await put(bucket, record, current)) return
  }
  throw new Error('Shared toilet invalidation contention')
}
export function sharedToiletCacheEnabled() { return process.env.SHARED_TOILET_CACHE_ENABLED === 'true' }
export async function getSharedToiletBucket(): Promise<R2BucketLike | null> {
  if (!sharedToiletCacheEnabled()) return null
  const { getCloudflareContext } = await import('@opennextjs/cloudflare')
  const { env } = await getCloudflareContext({ async: true })
  const bucket = (env as Record<string, unknown>).PUBLIC_TOILET_DATA_CACHE_R2
  if (!bucket) throw new Error('Shared toilet cache binding unavailable')
  return bucket as R2BucketLike
}
export async function persistSharedToiletInvalidation(events: ToiletCacheEvent[]) {
  const bucket = await getSharedToiletBucket()
  if (!bucket) return
  for (const event of events) await applySharedToiletInvalidation(bucket, event)
}
