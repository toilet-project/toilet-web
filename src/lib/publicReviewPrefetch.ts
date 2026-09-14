import { createApiUrl } from '../config/api'
import { publicPhotoPath } from './profilePhoto'
import { decodeReview, type StoredReview } from './reviewApi'

export type PublicReviewPage = { items: StoredReview[]; hasMore: boolean; nextCursor: string | null }

export const PUBLIC_REVIEW_API_ENABLED = process.env.NEXT_PUBLIC_PUBLIC_REVIEW_API_ENABLED === 'true'
export const PUBLIC_REVIEW_PREFETCH_TTL_MS = 30_000
export const PUBLIC_REVIEW_PREFETCH_PHOTO_LIMIT = 3
const MAX_CACHED_TOILETS = 24
const PHOTO_WARM_TIMEOUT_MS = 4_000

const cache = new Map<number, { page: PublicReviewPage; expiresAt: number }>()
const pending = new Map<number, Promise<PublicReviewPage>>()

export function decodePublicReviewPage(value: unknown, toiletId: number, cursor: string | null): PublicReviewPage {
  const page = value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  if (!Array.isArray(page.items) || page.items.length > 10 || typeof page.hasMore !== 'boolean'
    || !(page.nextCursor === null || typeof page.nextCursor === 'string' && page.nextCursor.length <= 100)
    || (page.hasMore ? !page.nextCursor || page.nextCursor === cursor || !page.items.length : page.nextCursor !== null)) throw new Error('INVALID_PUBLIC_REVIEW_PAGE')
  const items = page.items.map(decodeReview)
  if (items.some(item => item.toiletId !== toiletId) || new Set(items.map(item => item.id)).size !== items.length) throw new Error('INVALID_PUBLIC_REVIEW_PAGE')
  return { items, hasMore: page.hasMore, nextCursor: page.nextCursor as string | null }
}

export function publicReviewPhotoPaths(items: StoredReview[]) {
  const paths: string[] = []
  for (const item of items) {
    if (item.authorRemoved || !item.authorPhotoVersion) continue
    const path = publicPhotoPath(item.authorPhotoVersion)
    if (path && !paths.includes(path)) paths.push(path)
    if (paths.length === PUBLIC_REVIEW_PREFETCH_PHOTO_LIMIT) break
  }
  return paths
}

async function warmPublicReviewPhotos(items: StoredReview[], signal?: AbortSignal) {
  if (typeof window === 'undefined' || signal?.aborted) return
  await Promise.allSettled(publicReviewPhotoPaths(items).map(path => new Promise<void>(resolve => {
    const image = new window.Image()
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      image.onload = null
      image.onerror = null
      resolve()
    }
    const cancel = () => { image.src = ''; finish() }
    const timer = window.setTimeout(finish, PHOTO_WARM_TIMEOUT_MS)
    signal?.addEventListener('abort', cancel, { once: true })
    image.decoding = 'async'
    image.fetchPriority = 'low'
    image.onload = () => { void image.decode().catch(() => undefined).finally(finish) }
    image.onerror = finish
    image.src = createApiUrl(path)
  })))
}

async function requestPublicReviewPage(toiletId: number, cursor: string | null, signal?: AbortSignal) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 10_000)
  try {
    const query = new URLSearchParams({ size: '10' })
    if (cursor) query.set('cursor', cursor)
    const response = await fetch(createApiUrl(`/api/v1/toilets/${toiletId}/reviews?${query}`), {
      credentials: 'omit', cache: 'no-store', signal: controller.signal,
    })
    if (!response.ok) throw new Error('PUBLIC_REVIEW_REQUEST_FAILED')
    const page = decodePublicReviewPage(await response.json(), toiletId, cursor)
    await warmPublicReviewPhotos(page.items, controller.signal)
    return page
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

function remember(toiletId: number, page: PublicReviewPage) {
  const now = Date.now()
  for (const [id, entry] of cache) if (entry.expiresAt <= now) cache.delete(id)
  cache.delete(toiletId)
  cache.set(toiletId, { page, expiresAt: now + PUBLIC_REVIEW_PREFETCH_TTL_MS })
  while (cache.size > MAX_CACHED_TOILETS) cache.delete(cache.keys().next().value as number)
  return page
}

export function cachedPublicReviews(toiletId: number) {
  const entry = cache.get(toiletId)
  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(toiletId)
    return null
  }
  return entry.page
}

export function prefetchPublicReviews(toiletId: number, _signal?: AbortSignal): Promise<PublicReviewPage> {
  const cached = cachedPublicReviews(toiletId)
  if (cached) return Promise.resolve(cached)
  const current = pending.get(toiletId)
  if (current) return current
  let request: Promise<PublicReviewPage>
  // The first card can be replaced by the interactive map card while this shared
  // read is in flight. Keep the bounded request alive so the successor can reuse it.
  // Each caller still ignores completion after its own signal/unmount.
  request = requestPublicReviewPage(toiletId, null)
    .then(page => remember(toiletId, page))
    .finally(() => { if (pending.get(toiletId) === request) pending.delete(toiletId) })
  pending.set(toiletId, request)
  return request
}

export async function loadPublicReviews(toiletId: number, cursor: string | null, signal?: AbortSignal, refresh = false) {
  if (!cursor && !refresh) return prefetchPublicReviews(toiletId, signal)
  const page = await requestPublicReviewPage(toiletId, cursor, signal)
  return cursor ? page : remember(toiletId, page)
}

export function invalidatePublicReviewPrefetch(toiletId?: number) {
  if (toiletId === undefined) cache.clear()
  else cache.delete(toiletId)
}
