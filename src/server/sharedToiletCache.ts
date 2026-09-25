import type { NormalizedOpeningHours, ToiletDetailResponse } from '../api/toilets'

export const SHARED_TOILET_CACHE_SCHEMA = 1
export const SHARED_TOILET_CACHE_PREFIX = `public-toilets/v${SHARED_TOILET_CACHE_SCHEMA}`
const DEFAULT_FRESH_SECONDS = 2_592_000
const DEFAULT_STALE_SECONDS = 3_196_800
const DEFAULT_NEGATIVE_SECONDS = 300

export type ToiletCacheAction = 'UPSERT' | 'DELETE' | 'PRIVATE'
export type ToiletCacheEvent = { toiletId: number; revision: number; action: ToiletCacheAction; catalogChanged: boolean }
type CacheState = 'data' | 'negative' | 'invalidated' | 'deleted'
export type SharedToiletRecord = {
  schema: number; toiletId: number; revision: number; state: CacheState; storedAt: number
  freshUntil?: number; staleUntil?: number; data?: ToiletDetailResponse
}
export type R2ObjectBodyLike = { etag: string; json<T>(): Promise<T>; arrayBuffer(): Promise<ArrayBuffer> }
export type R2PutOnlyIf = { etagMatches?: string; etagDoesNotMatch?: string }
export type R2BucketLike = {
  get(key: string): Promise<R2ObjectBodyLike | null>
  put(key: string, value: string | Uint8Array, options?: { onlyIf?: R2PutOnlyIf; httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<{ etag: string } | null>
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
  const timing = {
    fresh: integerSetting('SHARED_TOILET_CACHE_FRESH_SECONDS', DEFAULT_FRESH_SECONDS, 60, 31_536_000),
    stale: integerSetting('SHARED_TOILET_CACHE_STALE_SECONDS', DEFAULT_STALE_SECONDS, 60, 31_536_000),
    negative: integerSetting('SHARED_TOILET_CACHE_NEGATIVE_SECONDS', DEFAULT_NEGATIVE_SECONDS, 10, 3600),
  }
  if (timing.stale < timing.fresh) throw new Error('Shared toilet stale period must include the fresh period')
  return timing
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
function translationMap(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const translations: NonNullable<ToiletDetailResponse['translations']> = {}
  for (const [rawLocale, rawText] of Object.entries(value as Record<string, unknown>)) {
    const locale = rawLocale.trim().toLowerCase().replace('_', '-')
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(locale) || locale.length > 12
      || !rawText || typeof rawText !== 'object' || Array.isArray(rawText)) continue
    const text = rawText as Record<string, unknown>
    if (typeof text.name !== 'string' || !text.name.trim()) continue
    translations[locale] = {
      name: text.name.trim(),
      roadAddress: text.roadAddress == null ? null : String(text.roadAddress),
      jibunAddress: text.jibunAddress == null ? null : String(text.jibunAddress),
    }
  }
  return Object.keys(translations).length ? translations : undefined
}

function openingTime(value: unknown): value is string | null {
  if (value === null) return true
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false
  return Number(value.slice(0, 2)) < 24 && Number(value.slice(3)) < 60
}

function normalizedOpeningHours(value: unknown): NormalizedOpeningHours | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const { openingPolicy, open24h, status, confidence, parserVersion, holidayPolicy,
    manualOverride, sourceChanged, schedules } = input
  if (typeof openingPolicy !== 'string' || typeof status !== 'string'
    || typeof parserVersion !== 'string' || typeof holidayPolicy !== 'string'
    || (open24h !== null && typeof open24h !== 'boolean')
    || (confidence !== null && (typeof confidence !== 'number' || !Number.isFinite(confidence)))
    || typeof manualOverride !== 'boolean' || typeof sourceChanged !== 'boolean'
    || !Array.isArray(schedules)) return null
  const publicSchedules: NormalizedOpeningHours['schedules'] = []
  for (const value of schedules) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const slot = value as Record<string, unknown>
    const { dayOfWeek, slotIndex, startTime, endTime, crossesMidnight, closed } = slot
    if (!Number.isSafeInteger(dayOfWeek) || (dayOfWeek as number) < 1 || (dayOfWeek as number) > 7
      || !Number.isSafeInteger(slotIndex) || (slotIndex as number) < 0
      || !openingTime(startTime) || !openingTime(endTime)
      || typeof crossesMidnight !== 'boolean' || typeof closed !== 'boolean') return null
    publicSchedules.push({ dayOfWeek: dayOfWeek as number, slotIndex: slotIndex as number,
      startTime, endTime, crossesMidnight, closed })
  }
  return { openingPolicy, open24h, status, confidence, parserVersion, holidayPolicy,
    manualOverride, sourceChanged, schedules: publicSchedules }
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
    openTimeDetail: optionalString(input.openTimeDetail),
    ...(Object.hasOwn(input, 'normalizedOpeningHours')
      ? { normalizedOpeningHours: normalizedOpeningHours(input.normalizedOpeningHours) } : {}),
    installationDate: optionalString(input.installationDate),
    hasEmergencyBell: optionalString(input.hasEmergencyBell), emergencyBellLocation: optionalString(input.emergencyBellLocation),
    hasCctv: optionalString(input.hasCctv), hasDiaperTable: optionalString(input.hasDiaperTable),
    diaperTableLocation: optionalString(input.diaperTableLocation), dataBaseDate: optionalString(input.dataBaseDate),
    dataSource: optionalString(input.dataSource), translations: translationMap(input.translations),
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
  // Use the structured R2 condition in server components. A Headers instance can
  // cross a Next.js/runtime realm boundary and fail the Workers API brand check.
  return current ? { etagMatches: current.etag } : { etagDoesNotMatch: '*' }
}
async function put(bucket: R2BucketLike, record: SharedToiletRecord, current: Loaded) {
  return bucket.put(sharedToiletCacheKey(record.toiletId), JSON.stringify(record), {
    onlyIf: condition(current), httpMetadata: { contentType: 'application/json' },
    customMetadata: { schema: String(record.schema), revision: String(record.revision), state: record.state },
  })
}
function policyExpiry(record: SharedToiletRecord, seconds: number) { return record.storedAt + seconds * 1000 }
function recordFromOrigin(toiletId: number, revision: number, origin: ToiletDetailResponse | null,
  timestamp: number, timing: ReturnType<typeof cacheTiming>): SharedToiletRecord {
  return origin ? {
    schema: SHARED_TOILET_CACHE_SCHEMA, toiletId, revision, state: 'data', storedAt: timestamp,
    freshUntil: timestamp + timing.fresh * 1000, staleUntil: timestamp + timing.stale * 1000,
    data: sanitizePublicToiletDetail(origin, toiletId),
  } : {
    schema: SHARED_TOILET_CACHE_SCHEMA, toiletId, revision, state: 'negative', storedAt: timestamp,
    freshUntil: timestamp + timing.negative * 1000,
  }
}
function cachedValue(record: SharedToiletRecord, now: number, timing: ReturnType<typeof cacheTiming>) {
  // Expiry follows the currently deployed policy. This lets valid v1 objects
  // created by the former one-hour policy be adopted without an origin read.
  if (record.state === 'data' && policyExpiry(record, timing.fresh) > now) return { hit: true as const, value: record.data! }
  if (record.state === 'negative' && policyExpiry(record, timing.negative) > now) return { hit: true as const, value: null }
  if (record.state === 'deleted') return { hit: true as const, value: null }
  return { hit: false as const }
}

export async function readThroughSharedToiletCache(options: { bucket: R2BucketLike; toiletId: number; fetchOrigin: () => Promise<ToiletDetailResponse | null>; now?: () => number }) {
  const now = options.now ?? Date.now
  const timing = cacheTiming()
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let current: Loaded
    try { current = await load(options.bucket, options.toiletId) }
    catch { return options.fetchOrigin() }
    if (current?.record) {
      const cached = cachedValue(current.record, now(), timing)
      if (cached.hit) return cached.value
    }
    let origin: ToiletDetailResponse | null
    try { origin = await options.fetchOrigin() }
    catch (error) {
      if (current?.record?.state === 'data' && policyExpiry(current.record, timing.stale) > now()) return current.record.data!
      throw error
    }
    const record = recordFromOrigin(options.toiletId, current?.record?.revision ?? 0, origin, now(), timing)
    try { if (await put(options.bucket, record, current)) return origin }
    catch { return origin }
  }
  try {
    const winner = await load(options.bucket, options.toiletId)
    if (winner?.record) {
      const cached = cachedValue(winner.record, now(), timing)
      if (cached.hit) return cached.value
    }
  } catch {
    // A shared-cache outage must not make a public detail page unavailable.
  }
  return options.fetchOrigin()
}

export async function refreshSharedToiletCache(options: { bucket: R2BucketLike; toiletId: number;
  fetchOrigin: () => Promise<ToiletDetailResponse | null>; now?: () => number }) {
  const now = options.now ?? Date.now
  const timing = cacheTiming()
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await load(options.bucket, options.toiletId)
    // A delete/private event is authoritative. A later UPSERT event changes the
    // tombstone to invalidated before this maintenance path can repopulate it.
    if (current?.record?.state === 'deleted') return current.record
    const origin = await options.fetchOrigin()
    const record = recordFromOrigin(options.toiletId, current?.record?.revision ?? 0, origin, now(), timing)
    if (await put(options.bucket, record, current)) return record
  }
  throw new Error('Shared toilet refresh contention')
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
  await applySharedToiletInvalidations(bucket, events)
}

export async function applySharedToiletInvalidations(bucket: R2BucketLike, events: ToiletCacheEvent[]) {
  // A signed delivery can contain 100 toilets. Serial R2 reads and writes can
  // outlast the API sender's timeout, leaving the entire outbox batch pending.
  // Bound concurrency below Workers' six simultaneous outgoing connections;
  // finish every attempted event before returning a retryable failure.
  let cursor = 0
  let failed = false
  await Promise.all(Array.from({ length: Math.min(4, events.length) }, async () => {
    while (cursor < events.length) {
      const event = events[cursor++]
      try { await applySharedToiletInvalidation(bucket, event) }
      catch { failed = true }
    }
  }))
  if (failed) throw new Error('Shared toilet invalidation failed')
}
