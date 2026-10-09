import { indexableFacilityLocales } from '../i18n/facilitySeo.ts'
import { localizedPublicPath, parseLocalizedPublicPath } from '../i18n/routes.ts'
import { parseRegionToiletSegment, regionToiletPath } from '../lib/regionToiletPath.ts'
import { getDistrict, localizedRegionPath } from '../lib/regions.ts'
import { codeFromRegionSegment } from '../lib/urlName.ts'
import { SITE_ORIGIN } from '../lib/seo.ts'
import type { ToiletDetailResponse } from '../api/toilets.ts'
import type { R2BucketLike, ToiletCacheEvent } from './sharedToiletCache.ts'
import { createIndexNowRateLimit, IndexNowRateLimitError, indexNowRetryAt } from './indexNowRateLimit.ts'
import type { IndexNowRateLimit } from './indexNowRateLimit.ts'

export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'
export const INDEXNOW_KEY = '237e18b19a2de7283207a1343afffb4dbf4dc12e24af2c9208999c2238df9c24'
export const INDEXNOW_KEY_PATH = `/${INDEXNOW_KEY}.txt`
const INDEXNOW_MAX_URLS = 10_000
const INDEXNOW_TIMEOUT_MS = 5_000
const INDEXNOW_RETRIES = 2
const DETAIL_CONCURRENCY = 4

type FetchLike = typeof fetch

export class IndexNowSubmissionError extends Error {
  readonly reason: 'http' | 'timeout' | 'network'
  readonly status: number | null
  readonly retryAt?: number
  constructor(reason: 'http' | 'timeout' | 'network', status: number | null = null, retryAt?: number) {
    super(`IndexNow submission failed (${reason}${status === null ? '' : ` ${status}`})`)
    this.name = 'IndexNowSubmissionError'
    this.reason = reason
    this.status = status
    this.retryAt = retryAt
  }
}

export function indexNowFailureInfo(error: unknown) {
  return error instanceof IndexNowRateLimitError
    ? { reason: 'rate_limit', status: 429, retryAt: error.retryAt }
    : error instanceof IndexNowSubmissionError
    ? { reason: error.reason, status: error.status, ...(error.retryAt === undefined ? {} : { retryAt: error.retryAt }) }
    : { reason: 'unexpected', status: null, errorName: error instanceof Error ? error.name : typeof error }
}

export function logIndexNowResult(scope: 'URL' | 'district URL',
  result: { submitted: number; status: number | null }, startedAt: number) {
  // A skipped batch made no request; 202 still requires key validation by the receiver.
  const outcome = result.submitted === 0 ? 'skipped'
    : result.status === 202 ? 'received pending key validation' : 'accepted'
  console.info(`IndexNow ${scope} update ${outcome}`, {
    ...result, elapsedMs: Math.max(0, Date.now() - startedAt),
  })
}

export function indexNowEnabled() {
  return process.env.SITE_INDEXABLE === 'true' && process.env.INDEXNOW_ENABLED === 'true'
}

function isIndexableDetailPath(path: string) {
  const parsed = parseLocalizedPublicPath(path)
  if (!parsed || parsed.suffix) return false
  const parts = parsed.path.split('/')
  return parts.length === 6 && parts[4] === 'toilet' && parseRegionToiletSegment(parts[5]) !== null
    && isCanonicalDistrictPath(localizedPublicPath(parts.slice(0, 4).join('/'), parsed.locale)!)
}

function isCanonicalDistrictPath(path: string) {
  const parsed = parseLocalizedPublicPath(path)
  if (!parsed || parsed.suffix) return false
  const parts = parsed.path.split('/')
  if (parts.length !== 4 || parts[1] !== 'regions') return false
  const provinceCode = codeFromRegionSegment(parts[2], 2)
  const districtCode = codeFromRegionSegment(parts[3], 5)
  return Boolean(provinceCode && districtCode && getDistrict(provinceCode, districtCode)
    && parsed.path === localizedRegionPath(parsed.locale, provinceCode, districtCode))
}

/** Keep IndexNow input on this site's known public canonical routes only. */
export function indexNowUrls(paths: Iterable<string>) {
  const urls = new Set<string>()
  for (const path of paths) {
    if (!isIndexableDetailPath(path) && !isCanonicalDistrictPath(path)) continue
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

function retryable(status: number) { return status >= 500 }
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))

export async function submitIndexNow(paths: Iterable<string>, fetchImpl: FetchLike = fetch,
  wait: (milliseconds: number) => Promise<unknown> = delay, rateLimit?: IndexNowRateLimit) {
  const payload = buildIndexNowPayload(paths)
  if (!payload) return { submitted: 0, status: null }
  for (let attempt = 0; attempt <= INDEXNOW_RETRIES; attempt++) {
    await rateLimit?.check()
    let response: Response
    try {
      response = await fetchImpl(INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(INDEXNOW_TIMEOUT_MS),
      })
    } catch (error) {
      if (attempt === INDEXNOW_RETRIES) {
        throw new IndexNowSubmissionError(error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network')
      }
      await wait(250 * (2 ** attempt))
      continue
    }
    if (response.ok) return { submitted: payload.urlList.length, status: response.status }
    if (response.status === 429) {
      const retryAt = indexNowRetryAt(response.headers.get('Retry-After'), Date.now())
      try { await rateLimit?.defer(retryAt) } catch (error) {
        console.error('IndexNow cooldown persistence failed', {
          errorName: error instanceof Error ? error.name : typeof error,
        })
      }
      // Do not repeat a rejected request in this background task.
      throw new IndexNowSubmissionError('http', 429, retryAt)
    }
    if (!retryable(response.status) || attempt === INDEXNOW_RETRIES) {
      throw new IndexNowSubmissionError('http', response.status)
    }
    await wait(250 * (2 ** attempt))
  }
  throw new IndexNowSubmissionError('network')
}

export function canonicalIndexNowPaths(detail: ToiletDetailResponse) {
  // Numeric routes are noindex, including facilities without a canonical district.
  return indexableFacilityLocales(detail).map(locale => localizedPublicPath(regionToiletPath(detail, locale), locale)!)
    .filter(isIndexableDetailPath)
}

async function fetchCurrentDetail(id: number, fetchImpl: FetchLike): Promise<ToiletDetailResponse | null> {
  const origin = (process.env.TOILET_API_ORIGIN || 'https://api.geupddong.com').replace(/\/$/, '')
  const response = await fetchImpl(`${origin}/api/v1/toilets/${id}`, {
    cache: 'no-store', signal: AbortSignal.timeout(INDEXNOW_TIMEOUT_MS),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new IndexNowSubmissionError('http', response.status)
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

export async function notifyIndexNowForEvents(events: readonly ToiletCacheEvent[], fetchImpl: FetchLike = fetch,
  previousDetails: ReadonlyMap<number, ToiletDetailResponse> = new Map(), rateLimit?: IndexNowRateLimit) {
  if (events.length) await rateLimit?.check()
  const paths = (await mapConcurrent(events, DETAIL_CONCURRENCY, async event => {
    const previous = previousDetails.get(event.toiletId)
    const formerPaths = previous ? canonicalIndexNowPaths(previous) : []
    if (event.action !== 'UPSERT') return formerPaths
    try {
      const detail = await fetchCurrentDetail(event.toiletId, fetchImpl)
      return [...formerPaths, ...(detail ? canonicalIndexNowPaths(detail) : [])]
    } catch (error) {
      // One unavailable detail must not suppress notifications for the rest of the signed batch.
      console.error('IndexNow detail lookup skipped', { toiletId: event.toiletId, ...indexNowFailureInfo(error) })
      return []
    }
  })).flat()
  return submitIndexNow(paths, fetchImpl, undefined, rateLimit)
}

/** Schedule a best-effort notification without changing cache-invalidation acknowledgement. */
export async function scheduleIndexNowNotification(events: readonly ToiletCacheEvent[],
  previousDetails: ReadonlyMap<number, ToiletDetailResponse> = new Map()) {
  if (!indexNowEnabled()) return false
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { ctx, env } = await getCloudflareContext({ async: true })
    const bucket = (env as Record<string, unknown>).PUBLIC_TOILET_DATA_CACHE_R2 as R2BucketLike | undefined
    if (!bucket) throw new Error('IndexNow cooldown binding unavailable')
    const startedAt = Date.now()
    ctx.waitUntil(notifyIndexNowForEvents(events, fetch, previousDetails, createIndexNowRateLimit(bucket)).then(result => {
      logIndexNowResult('URL', result, startedAt)
    }).catch(error => {
      // Keep the failure actionable without logging the key or submitted URLs.
      console.error('IndexNow URL update failed', { ...indexNowFailureInfo(error), elapsedMs: Date.now() - startedAt })
    }))
    return true
  } catch (error) {
    console.error('IndexNow scheduling failed', indexNowFailureInfo(error))
    return false
  }
}
