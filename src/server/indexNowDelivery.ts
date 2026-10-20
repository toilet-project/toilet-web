import { canonicalIndexNowPaths, indexNowFailureInfo, indexNowUrls } from './indexNow.ts'
import { SUPPORTED_LOCALES } from '../i18n/locale.ts'
import { localizedPublicPath } from '../i18n/routes.ts'
import { getDistrict, localizedRegionPath } from '../lib/regions.ts'
import { regionDirectoryEntries } from '../lib/regionDirectory.ts'
import type { ToiletDetailResponse, ToiletMapItemResponse } from '../api/toilets.ts'
import type { ToiletCacheEvent } from './sharedToiletCache.ts'
import type { IndexNowOutboxBucket } from './indexNowOutbox.ts'
import { createIndexNowOutbox } from './indexNowOutbox.ts'

const PREFIX = 'indexnow/intents/v1/'
type Hashes = Record<string, string>
export type IndexNowIntent =
  | { kind: 'detail'; event: ToiletCacheEvent; formerPaths: string[] }
  | { kind: 'district'; code: string; before: Hashes | null }
type RecordValue = {
  schema: 1; intent: IndexNowIntent; state: 'staged' | 'pending' | 'leased' | 'done' | 'blocked'
  attempts: number; dueAt: number; leaseUntil: number; paths?: string[]
}
export async function indexNowDigest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}
function publicPaths(paths: string[]) {
  return indexNowUrls(paths).map(url => decodeURI(new URL(url).pathname)).sort()
}
function validPaths(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 100 && value.every(path => typeof path === 'string')
    && JSON.stringify(publicPaths(value)) === JSON.stringify(value)
}
function validIntent(value: IndexNowIntent) {
  if (!value || typeof value !== 'object') return false
  if (value.kind === 'detail') return value.event && Number.isSafeInteger(value.event.toiletId)
    && value.event.toiletId > 0 && Number.isSafeInteger(value.event.revision) && value.event.revision > 0
    && ['UPSERT', 'DELETE', 'PRIVATE'].includes(value.event.action)
    && typeof value.event.catalogChanged === 'boolean' && validPaths(value.formerPaths)
  if (value.kind !== 'district' || !/^\d{5}$/.test(value.code)
    || !getDistrict(value.code.slice(0, 2), value.code)) return false
  return value.before === null || Object.keys(value.before).length === SUPPORTED_LOCALES.length
    && SUPPORTED_LOCALES.every(locale => /^[a-f0-9]{64}$/.test(value.before![locale] ?? ''))
}
export async function directoryHashes(rows: readonly ToiletMapItemResponse[], code: string): Promise<Hashes> {
  return Object.fromEntries(await Promise.all(SUPPORTED_LOCALES.map(async locale => [locale,
    await indexNowDigest(JSON.stringify(regionDirectoryEntries(rows, locale, code)))])))
}
export async function resolveIndexNowIntent(intent: IndexNowIntent, dependencies: {
  detail: (id: number) => Promise<ToiletDetailResponse | null>
  district: (code: string) => Promise<ToiletMapItemResponse[]>
}) {
  if (!validIntent(intent)) throw new Error('Invalid IndexNow intent')
  if (intent.kind === 'detail') {
    const current = intent.event.action === 'UPSERT' ? await dependencies.detail(intent.event.toiletId) : null
    return publicPaths([...intent.formerPaths, ...(current ? canonicalIndexNowPaths(current) : [])])
  }
  if (!intent.before) return [] // Never fabricate a before-image or interpret a failed origin read as empty.
  const current = await directoryHashes(await dependencies.district(intent.code), intent.code)
  return publicPaths(SUPPORTED_LOCALES.filter(locale => current[locale] !== intent.before![locale])
    .map(locale => localizedPublicPath(localizedRegionPath(locale, intent.code.slice(0, 2), intent.code), locale)!))
}

export function createIndexNowDelivery(bucket: IndexNowOutboxBucket, now: () => number = Date.now) {
  const queue = createIndexNowOutbox(bucket, now)
  async function load(key: string) {
    const object = await bucket.get(key)
    if (!object) return null
    const value = await object.json<RecordValue>()
    if (!value || value.schema !== 1 || !validIntent(value.intent)
      || !['staged', 'pending', 'leased', 'done', 'blocked'].includes(value.state)
      || !Number.isSafeInteger(value.attempts) || value.attempts < 0 || value.attempts > 8
      || !Number.isSafeInteger(value.dueAt) || value.dueAt < 0
      || !Number.isSafeInteger(value.leaseUntil) || value.leaseUntil < 0
      || value.paths !== undefined && !validPaths(value.paths)) throw new Error('Invalid IndexNow delivery record')
    return { value, etag: object.etag }
  }
  function put(key: string, value: RecordValue, etag?: string) {
    return bucket.put(key, JSON.stringify(value), { onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'application/json' } })
  }
  async function stage(identity: string, build: () => Promise<IndexNowIntent>) {
    const key = PREFIX + await indexNowDigest(identity) + '.json'
    // A retried cache event must reuse the original before-image, not the now-invalidated cache.
    if (await load(key)) return key
    const intent = await build()
    if (!validIntent(intent)) throw new Error('Invalid IndexNow delivery intent')
    if (!await put(key, { schema: 1, intent, state: 'staged', attempts: 0, dueAt: now(), leaseUntil: 0 })
      && !await load(key)) throw new Error('IndexNow intent persistence failed')
    return key
  }
  return {
    async prepare(events: readonly ToiletCacheEvent[], codes: readonly string[], before: {
      detail: (event: ToiletCacheEvent) => Promise<ToiletDetailResponse | null>
      district: (code: string) => Promise<ToiletMapItemResponse[] | null>
    }) {
      if (events.length > 100 || events.some(event => event.revision < 1) || codes.length > 4)
        throw new Error('Unsupported IndexNow delivery scope')
      const tasks: (() => Promise<string>)[] = events.map(event => () => stage(
        `detail:${event.toiletId}:${event.revision}:${event.action}`, async () => {
          const previous = await before.detail(event)
          const { toiletId, revision, action, catalogChanged } = event
          return { kind: 'detail', event: { toiletId, revision, action, catalogChanged },
            formerPaths: previous ? publicPaths(canonicalIndexNowPaths(previous)) : [] }
        }))
      const batch = await indexNowDigest(JSON.stringify(events.map(({ toiletId, revision, action }) =>
        ({ toiletId, revision, action })).sort((a, b) => a.toiletId - b.toiletId)))
      for (const code of [...new Set(codes)]) tasks.push(() => stage(`district:${code}:${batch}`, async () => {
        const previous = await before.district(code)
        return { kind: 'district', code, before: previous ? await directoryHashes(previous, code) : null }
      }))
      const keys: string[] = []
      let cursor = 0, failed = false
      await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, async () => {
        while (cursor < tasks.length) {
          const index = cursor++
          try { keys[index] = await tasks[index]() } catch { failed = true }
        }
      }))
      if (failed) throw new Error('IndexNow intent persistence failed')
      return keys
    },
    async release(keys: readonly string[]) {
      let cursor = 0
      await Promise.all(Array.from({ length: Math.min(4, keys.length) }, async () => {
        while (cursor < keys.length) {
          const key = keys[cursor++]
          let released = false
          for (let attempt = 0; attempt < 4; attempt++) {
            const current = await load(key)
            if (!current) throw new Error('IndexNow staged intent missing')
            if (current.value.state !== 'staged') { released = true; break }
            if (await put(key, { ...current.value, state: 'pending' }, current.etag)) { released = true; break }
          }
          if (!released) throw new Error('IndexNow intent release contention')
        }
      }))
    },
    async resolvePending(resolve: (intent: IndexNowIntent) => Promise<string[]>, options: {
      cursor?: string; check: () => Promise<void>
    }) {
      await options.check()
      const page = await bucket.list({ prefix: PREFIX, limit: 2, cursor: options.cursor })
      let completed = 0, deferred = 0, blocked = 0
      await Promise.all(page.objects.slice(0, 2).map(async ({ key }) => {
        if (!/^indexnow\/intents\/v1\/[a-f0-9]{64}\.json$/.test(key)) return
        const current = await load(key)
        if (!current || ['staged', 'done', 'blocked'].includes(current.value.state)
          || current.value.dueAt > now() || current.value.leaseUntil > now()) return
        if (current.value.attempts >= 8) {
          if (await put(key, { ...current.value, state: 'blocked', leaseUntil: 0 }, current.etag)) blocked++
          return
        }
        const value: RecordValue = { ...current.value, state: 'leased', attempts: current.value.attempts + 1,
          leaseUntil: now() + 120_000 }
        let lease = await put(key, value, current.etag)
        if (!lease) return
        try {
          await options.check()
          if (!value.paths) {
            value.paths = publicPaths(await resolve(value.intent))
            if (value.paths.length > 100) throw new Error('IndexNow intent requires partitioning')
            // Freeze resolved paths before queue creation; a restart must not recalculate a different payload.
            lease = await put(key, value, lease.etag)
            if (!lease) return
          }
          await queue.enqueue('intent:' + key.slice(PREFIX.length), value.paths)
          if (await put(key, { ...value, state: 'done', leaseUntil: 0 }, lease.etag)) completed++
        } catch (error) {
          if (!lease) return
          const failure = indexNowFailureInfo(error)
          // A cooldown race after claiming work did not attempt an origin lookup or remote submission.
          const attempts = failure.reason === 'rate_limit' ? value.attempts - 1 : value.attempts
          const state = attempts >= 8 ? 'blocked' : 'pending'
          const retryAt = 'retryAt' in failure && typeof failure.retryAt === 'number' ? failure.retryAt : 0
          if (await put(key, { ...value, attempts, state, leaseUntil: 0,
            dueAt: Math.max(retryAt, now() + Math.min(86_400_000, 600_000 * 2 ** Math.max(0, attempts - 1))) }, lease.etag)) {
            if (state === 'blocked') blocked++; else deferred++
          }
        }
      }))
      return { completed, deferred, blocked, cursor: page.truncated ? page.cursor : undefined }
    },
  }
}
