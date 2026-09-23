import { indexableFacilityLocales } from '../i18n/facilitySeo.ts'
import { localizedPublicPath, localizedToiletPaths, parseLocalizedPublicPath } from '../i18n/routes.ts'
import { regionToiletPath } from '../lib/regionToiletPath.ts'
import { SITE_ORIGIN } from '../lib/seo.ts'
import type { ToiletDetailResponse } from '../api/toilets.ts'
import type { ToiletCacheEvent } from './sharedToiletCache.ts'

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/IndexNow'
export const INDEXNOW_KEY = '237e18b19a2de7283207a1343afffb4dbf4dc12e24af2c9208999c2238df9c24'
export const INDEXNOW_KEY_PATH = `/${INDEXNOW_KEY}.txt`
const INDEXNOW_MAX_URLS = 10_000
const INDEXNOW_TIMEOUT_MS = 5_000
const INDEXNOW_RETRIES = 2
const DETAIL_CONCURRENCY = 4

type FetchLike = typeof fetch

export function indexNowEnabled() {
  return process.env.SITE_INDEXABLE === 'true' && process.env.INDEXNOW_ENABLED === 'true'
}

function isIndexableDetailPath(path: string) {
  const parsed = parseLocalizedPublicPath(path)
  if (!parsed || parsed.suffix) return false
  return /^\/toilet\/[1-9]\d*$/.test(parsed.path)
    || /^\/regions\/.+\/toilet\/[1-9]\d*-.+$/u.test(parsed.path)
}

/** Keep IndexNow input on this site's public, canonicalizable detail routes only. */
export function indexNowUrls(paths: Iterable<string>) {
  const urls = new Set<string>()
  for (const path of paths) {
    if (!isIndexableDetailPath(path)) continue
    const url = new URL(encodeURI(path), SITE_ORIGIN)
    if (url.origin !== SITE_ORIGIN || url.search || url.hash) continue
    urls.add(url.href)
    if (urls.size > INDEXNOW_MAX_URLS) throw new Error('IndexNow URL batch is too large')
  }
  return [...urls]
}

export function buildIndexNowPayload(paths: Iterable<string>) {
  const urlList = indexNowUrls(paths)
  if (!urlList.length) return null
  return {
    host: new URL(SITE_ORIGIN).host,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_ORIGIN}${INDEXNOW_KEY_PATH}`,
    urlList,
  }
}

function retryable(status: number) { return status === 429 || status >= 500 }
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))

export async function submitIndexNow(paths: Iterable<string>, fetchImpl: FetchLike = fetch,
  wait: (milliseconds: number) => Promise<unknown> = delay) {
  const payload = buildIndexNowPayload(paths)
  if (!payload) return { submitted: 0, status: null }
  for (let attempt = 0; attempt <= INDEXNOW_RETRIES; attempt++) {
    let response: Response
    try {
      response = await fetchImpl(INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(INDEXNOW_TIMEOUT_MS),
      })
    } catch (error) {
      if (attempt === INDEXNOW_RETRIES) throw error
      await wait(250 * (2 ** attempt))
      continue
    }
    if (response.ok) return { submitted: payload.urlList.length, status: response.status }
    if (!retryable(response.status) || attempt === INDEXNOW_RETRIES) {
      throw new Error(`IndexNow rejected URL update (${response.status})`)
    }
    await wait(250 * (2 ** attempt))
  }
  throw new Error('IndexNow submission failed')
}

export function canonicalIndexNowPaths(detail: ToiletDetailResponse) {
  return indexableFacilityLocales(detail).map(locale => localizedPublicPath(regionToiletPath(detail, locale), locale)!)
}

async function fetchCurrentDetail(id: number, fetchImpl: FetchLike): Promise<ToiletDetailResponse | null> {
  const origin = (process.env.TOILET_API_ORIGIN || 'https://api.geupddong.com').replace(/\/$/, '')
  const response = await fetchImpl(`${origin}/api/v1/toilets/${id}`, {
    cache: 'no-store', signal: AbortSignal.timeout(INDEXNOW_TIMEOUT_MS),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`IndexNow detail lookup failed (${response.status})`)
  const detail = await response.json() as ToiletDetailResponse
  if (detail.id !== id || typeof detail.name !== 'string') throw new Error('Invalid IndexNow detail response')
  return detail
}

async function mapConcurrent<T, R>(values: readonly T[], concurrency: number, mapper: (value: T) => Promise<R>) {
  const output: R[] = new Array(values.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++
      output[index] = await mapper(values[index])
    }
  }))
  return output
}

export async function notifyIndexNowForEvents(events: readonly ToiletCacheEvent[], fetchImpl: FetchLike = fetch) {
  const paths = (await mapConcurrent(events, DETAIL_CONCURRENCY, async event => {
    if (event.action !== 'UPSERT') return [...localizedToiletPaths(event.toiletId)]
    try {
      const detail = await fetchCurrentDetail(event.toiletId, fetchImpl)
      return detail ? canonicalIndexNowPaths(detail) : []
    } catch (error) {
      // One unavailable detail must not suppress notifications for the rest of the signed batch.
      console.error('IndexNow detail lookup skipped', { toiletId: event.toiletId, error })
      return []
    }
  })).flat()
  return submitIndexNow(paths, fetchImpl)
}

/** Schedule a best-effort notification without changing cache-invalidation acknowledgement. */
export async function scheduleIndexNowNotification(events: readonly ToiletCacheEvent[]) {
  if (!indexNowEnabled()) return false
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { ctx } = await getCloudflareContext({ async: true })
    ctx.waitUntil(notifyIndexNowForEvents(events).then(result => {
      console.info('IndexNow URL update accepted', result)
    }).catch(error => {
      console.error('IndexNow URL update failed', error)
    }))
    return true
  } catch (error) {
    console.error('IndexNow scheduling failed', error)
    return false
  }
}
