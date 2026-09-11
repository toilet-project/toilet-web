import type { Review, ReviewInput } from './review'
import type { HistoryRange } from './history'

export type StoredReview = Review & { version: number; canManage: boolean; editableUntil: string; authorDisplayName: string }
export type ReviewPosition = { latitude: number; longitude: number; accuracyMeters: number; measuredAt: string }
export type ReviewCreationStatus = { canCreate: boolean; existingReviewId: string | null; nextAllowedAt: string | null }
export type ReviewPage = { items: StoredReview[]; nextCursor: string | null; hasMore: boolean }
export type ReviewSummary = { count: number; rating: number | null; averageRating: number | null; paperPercent: number | null; paperSampleCount: number; latestWaitMinutes: number | null; latestWaitAt: string | null }
export class ReviewApiError extends Error {
  readonly code: string
  readonly existingReviewId: string | null
  constructor(code: string, message: string, existingReviewId: string | null = null) { super(message); this.code = code; this.existingReviewId = existingReviewId }
}
const messages: Record<string, string> = {
  REVIEWS_DISABLED: '리뷰 저장 기능을 준비하고 있어요.',
  AUTHENTICATION_REQUIRED: '로그인이 만료됐어요. 다시 로그인해 주세요.',
  REVIEW_ACCOUNT_UNAVAILABLE: '리뷰를 이용할 수 없는 계정입니다.',
  POLICY_CONSENT_REQUIRED: '필수 약관 동의를 먼저 확인해 주세요.',
  REVIEW_ALREADY_EXISTS: '작성한 리뷰 내역이 있습니다.',
  REVIEW_CHANGED: '다른 화면에서 리뷰가 변경됐어요. 목록을 다시 열어 확인해 주세요.',
  REVIEW_EDIT_EXPIRED: '작성 후 7일이 지나 수정·작성자 정보 지우기가 종료됐어요.',
  REVIEW_NOT_FOUND: '리뷰를 찾을 수 없어요. 목록을 다시 확인해 주세요.',
  REVIEW_COOLDOWN: '연속 등록은 잠시 기다린 뒤 다시 시도해 주세요.',
  REVIEW_DAILY_LIMIT: '오늘 작성 가능한 리뷰 수를 모두 이용했어요.',
  REVIEW_REQUEST_REUSED: '등록 요청이 변경됐어요. 기존 리뷰가 있는지 확인해 주세요.',
  REVIEW_INVALID_REQUEST: '리뷰 입력과 위치 정보를 다시 확인해 주세요.',
}
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const id = (v: unknown): v is string => typeof v === 'string' && /^[1-9]\d{0,18}$/.test(v)
const integer = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max
const finite = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const stamp = (v: unknown): v is string => typeof v === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v))
const malformed = () => new ReviewApiError('INVALID_RESPONSE', '리뷰 응답을 확인하지 못했어요. 다시 불러와 주세요.')
export function decodeReview(value: unknown): StoredReview {
  const r = object(value)
  if (!id(r.id) || !integer(r.toiletId, 1) || typeof r.toiletName !== 'string' || !integer(r.satisfaction, 1, 5)
    || !integer(r.cleanliness, 1, 5) || typeof r.paper !== 'boolean' || !integer(r.waitMinutes, 0, 60) || r.waitMinutes % 10 !== 0
    || typeof r.comment !== 'string' || Array.from(r.comment).length > 200 || !integer(r.version, 0)
    || !stamp(r.createdAt) || !stamp(r.updatedAt) || !stamp(r.editableUntil) || typeof r.canManage !== 'boolean'
    || typeof r.authorRemoved !== 'boolean' || typeof r.authorDisplayName !== 'string') throw malformed()
  // Allowlist the response; never keep unexpected identity/location fields in browser state.
  return { id: r.id, toiletId: r.toiletId, toiletName: r.toiletName, satisfaction: r.satisfaction, cleanliness: r.cleanliness,
    paper: r.paper, waitMinutes: r.waitMinutes, comment: r.comment, version: r.version, createdAt: r.createdAt,
    updatedAt: r.updatedAt, editableUntil: r.editableUntil, canManage: r.canManage, authorRemoved: r.authorRemoved, authorDisplayName: r.authorDisplayName }
}
function decodeStatus(value: unknown): ReviewCreationStatus {
  const r = object(value)
  if (typeof r.canCreate !== 'boolean' || !(r.existingReviewId === null || id(r.existingReviewId))
    || !(r.nextAllowedAt === null || stamp(r.nextAllowedAt))
    || (r.canCreate ? r.existingReviewId !== null || r.nextAllowedAt !== null : r.nextAllowedAt === null)) throw malformed()
  return { canCreate: r.canCreate, existingReviewId: r.existingReviewId, nextAllowedAt: r.nextAllowedAt }
}
const fields = (v: ReviewInput) => ({ satisfaction: v.satisfaction, cleanliness: v.cleanliness, paper: v.paper, waitMinutes: v.waitMinutes, comment: v.comment })
/** Reads may use the shared session refresh. Writes are sent exactly once, never automatically replayed. */
export function createReviewApi({ url, read, request = (...args) => fetch(...args) }: {
  url: (path: string) => string; read: (url: string) => Promise<Response>; request?: typeof fetch;
}) {
  async function call(path: string, init?: RequestInit): Promise<unknown> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([(async () => {
        const response = await (init ? request(url(path), { ...init, signal: controller.signal, credentials: 'include', cache: 'no-store' }) : read(url(path)))
        const body = await response.json().catch(() => null)
        if (!response.ok) {
          const e = object(object(body).error)
          const code = response.status === 401 ? 'AUTHENTICATION_REQUIRED' : typeof e.code === 'string' && Object.hasOwn(messages, e.code) ? e.code : 'REQUEST_FAILED'
          throw new ReviewApiError(code, messages[code] ?? (response.status === 400 ? messages.REVIEW_INVALID_REQUEST : '리뷰 요청을 완료하지 못했어요. 다시 확인해 주세요.'),
            code === 'REVIEW_ALREADY_EXISTS' && id(e.existingReviewId) ? e.existingReviewId : null)
        }
        return body
      })(), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new ReviewApiError('NETWORK', '연결이 지연되고 있어요. 저장 여부를 확인한 뒤 다시 시도해 주세요.')) }, 15_000) })])
    } catch (error) {
      if (error instanceof ReviewApiError) throw error
      throw new ReviewApiError('NETWORK', '서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
    } finally { clearTimeout(timer) }
  }
  const own = (v: unknown) => { const r = decodeReview(v); if (r.authorRemoved) throw malformed(); return r }
  const positiveToilet = (toiletId: number) => { if (!integer(toiletId, 1)) throw new ReviewApiError('INVALID_TARGET', '테스트용 화장실에는 실제 리뷰를 저장할 수 없어요.'); return toiletId }
  const reviewId = (value: string) => { if (!id(value)) throw malformed(); return value }
  const write = (method: string, body: unknown, extra: Record<string, string> = {}): RequestInit => ({ method, headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) })
  return {
    async status(toiletId: number) { return decodeStatus(await call(`/api/v1/reviews/creation-status?toiletId=${positiveToilet(toiletId)}`)) },
    async detail(value: string) { const r = own(await call(`/api/v1/reviews/${reviewId(value)}`)); if (r.id !== value) throw malformed(); return r },
    async mine(range: HistoryRange, cursor: string | null = null): Promise<ReviewPage> {
      const query = new URLSearchParams({ size: '10' })
      if (range.period !== 'all') { query.set('from', range.from); query.set('to', range.to) }
      if (cursor) query.set('cursor', cursor)
      const r = object(await call(`/api/v1/reviews/me?${query}`))
      if (!Array.isArray(r.items) || r.items.length > 10 || typeof r.hasMore !== 'boolean'
        || !(r.nextCursor === null || typeof r.nextCursor === 'string' && r.nextCursor.length > 0 && r.nextCursor.length <= 100)
        || (r.hasMore ? !r.nextCursor || !r.items.length || r.nextCursor === cursor : r.nextCursor !== null)) throw malformed()
      const items = r.items.map(own)
      if (new Set(items.map(item => item.id)).size !== items.length) throw malformed()
      return { items, hasMore: r.hasMore, nextCursor: r.nextCursor }
    },
    async create(toiletId: number, value: ReviewInput, position: ReviewPosition, key: string) {
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(key)) throw malformed()
      const fix = { latitude: position.latitude, longitude: position.longitude, accuracyMeters: position.accuracyMeters, measuredAt: position.measuredAt }
      const r = own(await call('/api/v1/reviews', write('POST', { toiletId: positiveToilet(toiletId), ...fields(value), position: fix }, { 'Idempotency-Key': key })))
      if (r.toiletId !== toiletId) throw malformed(); return r
    },
    async edit(value: StoredReview, input: ReviewInput) {
      const r = own(await call(`/api/v1/reviews/${reviewId(value.id)}`, write('PATCH', { version: value.version, ...fields(input) })))
      if (r.id !== value.id || r.toiletId !== value.toiletId || r.version <= value.version) throw malformed(); return r
    },
    async detach(value: StoredReview) {
      const r = object(await call(`/api/v1/reviews/${reviewId(value.id)}/detach-author`, write('POST', { version: value.version, acknowledgeContentRetention: true })))
      if (r.id !== value.id || r.contentRetained !== true || r.authorDisplayName !== '익명') throw malformed()
    },
    async summary(toiletId: number): Promise<ReviewSummary> {
      const r = object(await call(`/api/v1/toilets/${positiveToilet(toiletId)}/reviews/summary`))
      if (!integer(r.count, 0) || !(r.rating === null || finite(r.rating, 1, 5)) || !(r.averageRating === null || finite(r.averageRating, 1, 5))
        || !(r.paperPercent === null || finite(r.paperPercent, 0, 100)) || !integer(r.paperSampleCount, 0)
        || !(r.latestWaitMinutes === null || integer(r.latestWaitMinutes, 0, 60) && r.latestWaitMinutes % 10 === 0)
        || !(r.latestWaitAt === null || stamp(r.latestWaitAt))) throw malformed()
      return { count: r.count, rating: r.rating, averageRating: r.averageRating, paperPercent: r.paperPercent,
        paperSampleCount: r.paperSampleCount, latestWaitMinutes: r.latestWaitMinutes, latestWaitAt: r.latestWaitAt }
    },
  }
}
