export type EngagementCounts = { toiletId: number; views: number; likes: number }
export type LikeState = { toiletId: number; liked: boolean; likes: number }
export type LikedToilet = { id: number; name: string; toiletType: string; latitude: number | null; longitude: number | null; likedAt: string; translations: Record<string, string> }
export type LikedToiletPage = { items: LikedToilet[]; total: number; page: number; size: number }
export type LikeSort = 'newest' | 'oldest' | 'distance'
export type ViewResult = { counted: boolean; counts: EngagementCounts; nextEligibleAt: string | null }
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
export class EngagementError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code }
}
export function decodeCounts(value: unknown, toilet: number): EngagementCounts {
  const r = object(value)
  if (r.toiletId !== toilet || !count(r.views) || !count(r.likes)) throw new EngagementError(502, 'INVALID_RESPONSE')
  return { toiletId: toilet, views: r.views, likes: r.likes }
}
export function decodeLike(value: unknown, toilet: number): LikeState {
  const r = object(value)
  if (r.toiletId !== toilet || typeof r.liked !== 'boolean' || !count(r.likes)) throw new EngagementError(502, 'INVALID_RESPONSE')
  return { toiletId: toilet, liked: r.liked, likes: r.likes }
}
export function decodeLikedToilets(value: unknown): LikedToiletPage {
  const data = object(value)
  if (!Array.isArray(data.items) || !count(data.total) || !count(data.page) || !count(data.size) || data.size > 50 || data.items.length > data.size)
    throw new EngagementError(502, 'INVALID_RESPONSE')
  const items = data.items.map((value: unknown) => {
    const row = object(value), translations = object(row.translations)
    if (!count(row.id) || row.id === 0 || typeof row.name !== 'string' || typeof row.toiletType !== 'string'
      || (row.latitude !== null && typeof row.latitude !== 'number') || (row.longitude !== null && typeof row.longitude !== 'number')
      || typeof row.likedAt !== 'string' || !Object.values(translations).every(name => typeof name === 'string'))
      throw new EngagementError(502, 'INVALID_RESPONSE')
    return { id: row.id, name: row.name, toiletType: row.toiletType, latitude: row.latitude, longitude: row.longitude,
      likedAt: row.likedAt, translations: translations as Record<string, string> } as LikedToilet
  })
  return { items, total: data.total, page: data.page, size: data.size }
}
export function createEngagementApi(base: string, readSession: (url: string) => Promise<Response>, request: typeof fetch = fetch) {
  const url = (path: string) => `${base.replace(/\/$/, '')}${path}`
  const target = (id: number) => { if (!Number.isSafeInteger(id) || id <= 0) throw new EngagementError(400, 'INVALID_TARGET'); return id }
  async function json(response: Response): Promise<unknown> {
    const data: unknown = await response.json().catch(() => null)
    if (!response.ok) throw new EngagementError(response.status, String(object(object(data).error).code || 'REQUEST_FAILED'))
    return data
  }
  const path = (id: number) => `/api/v1/toilets/${target(id)}`
  const ownPath = (id: number) => url(`/api/v1/engagement/toilets/${target(id)}/like`)
  return {
    async counts(id: number, signal?: AbortSignal) {
      return decodeCounts(await json(await request(url(`${path(id)}/engagement`), { credentials: 'omit', cache: 'no-store', signal })), id)
    },
    async view(id: number, sessionId: string, eventId: string): Promise<ViewResult> {
      const data = object(await json(await request(url(`${path(id)}/views`), { method: 'POST', credentials: 'omit', cache: 'no-store', keepalive: true,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, eventId }), signal: AbortSignal.timeout(10000) })))
      if (typeof data.counted !== 'boolean' || !(data.nextEligibleAt === null || typeof data.nextEligibleAt === 'string' && Number.isFinite(Date.parse(data.nextEligibleAt)))) throw new EngagementError(502, 'INVALID_RESPONSE')
      return { counted: data.counted, counts: decodeCounts(data.counts, id), nextEligibleAt: data.nextEligibleAt as string | null }
    },
    async mine(id: number) { return decodeLike(await json(await readSession(ownPath(id))), id) },
    async listLikes(sort: LikeSort, page = 0, location?: { latitude: number; longitude: number }) {
      const query = new URLSearchParams({ sort, page: String(page), size: '30' })
      if (sort === 'distance' && location) { query.set('latitude', String(location.latitude)); query.set('longitude', String(location.longitude)) }
      return decodeLikedToilets(await json(await readSession(url(`/api/v1/engagement/likes?${query}`))))
    },
    async setLike(id: number, liked: boolean) {
      // PUT and DELETE express desired state. A retried request never toggles a like twice.
      return decodeLike(await json(await request(ownPath(id), { method: liked ? 'PUT' : 'DELETE', credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(10000) })), id)
    },
  }
}

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>
type Receipt = { session: string; event: string; until: number; pending: boolean }
const SESSION_KEY = 'geupddong.toilet-views.session.v1'
const RECEIPT_KEY = 'geupddong.toilet-views.receipts.v1'
const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)
/** Same-tab navigation/refresh/language changes share receipts; storage failure still uses memory + server guards. */
export function createViewRecorder(storage: StoragePort, uuid: () => string, now = Date.now) {
  let session = '', receipts: Record<string, Receipt> = {}
  const pending = new Map<number, Promise<ViewResult | null>>()
  try { session = storage.getItem(SESSION_KEY) || ''; receipts = JSON.parse(storage.getItem(RECEIPT_KEY) || '{}') } catch { /* memory fallback */ }
  if (!validId(session)) session = uuid()
  if (!receipts || typeof receipts !== 'object' || Array.isArray(receipts)) receipts = {}
  try { storage.setItem(SESSION_KEY, session) } catch { /* browser session stays in memory */ }
  const save = () => {
    // Keep the most recent 200 receipts, not an unbounded facility browsing history.
    receipts = Object.fromEntries(Object.entries(receipts).filter(([, r]) => r && r.session === session && validId(r.event) && r.until > now()).sort((a, b) => b[1].until - a[1].until).slice(0, 200))
    try { storage.setItem(RECEIPT_KEY, JSON.stringify(receipts)) } catch { /* memory fallback */ }
  }
  return (id: number, send: (session: string, event: string) => Promise<ViewResult>): Promise<ViewResult | null> => {
    const running = pending.get(id)
    if (running) return running
    const prior = receipts[id]
    if (prior?.session === session && prior.until > now() && !prior.pending) return Promise.resolve(null)
    const receipt: Receipt = prior?.session === session && prior.pending && prior.until > now() && validId(prior.event)
      ? prior : { session, event: uuid(), until: now() + 86400000, pending: true }
    receipts[id] = receipt; save()
    const job = send(session, receipt.event).then(result => {
      receipts[id] = { ...receipt, pending: false, until: result.nextEligibleAt ? Date.parse(result.nextEligibleAt) : now() + 1800000 }
      save(); return result
    }).finally(() => pending.delete(id))
    pending.set(id, job)
    return job
  }
}

/** One uninterrupted visible second; no prefetch/SSR/background-tab writes. */
export function observeDetailView(element: Element, seen: () => void) {
  let intersects = false, finished = false, timer: ReturnType<typeof setTimeout> | undefined
  const update = () => {
    clearTimeout(timer)
    if (!finished && intersects && document.visibilityState === 'visible') timer = setTimeout(() => { finished = true; seen() }, 1000)
  }
  const observer = new IntersectionObserver(entries => { intersects = entries.some(e => e.isIntersecting && e.intersectionRatio >= 0.5); update() }, { threshold: [0, 0.5] })
  observer.observe(element); document.addEventListener('visibilitychange', update)
  return () => { clearTimeout(timer); observer.disconnect(); document.removeEventListener('visibilitychange', update) }
}
