/** Client-side preview eligibility only; the review API must enforce its own rules. */
export type ReviewPoint = { latitude: number | null; longitude: number | null }
export type ReviewFix = { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number }
export class ReviewGateError extends Error {
  readonly code: 'location' | 'distance' | 'session'
  constructor(message: string, code: 'location' | 'distance' | 'session' = 'location') { super(message); this.code = code }
}
const OUTSIDE_REVIEW_RANGE = '150m 이내에서 작성할 수 있어요'
export const REVIEW_LOCATION_MAX_AGE_MS = 5 * 60_000

const validPoint = (point: ReviewPoint) => typeof point.latitude === 'number' && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
  && typeof point.longitude === 'number' && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180

export function reviewLocationProblem(target: ReviewPoint, fix: ReviewFix, now = Date.now()): string | null {
  if (!validPoint(target)) return '이 화장실의 위치를 확인할 수 없어 리뷰를 작성할 수 없어요.'
  if (!validPoint(fix.coords) || !Number.isFinite(fix.coords.accuracy) || fix.coords.accuracy < 0 || fix.coords.accuracy > 50)
    return '위치 정확도가 50m 이하여야 해요. 정확한 위치를 켜고 다시 시도해 주세요.'
  if (!Number.isFinite(fix.timestamp) || now - fix.timestamp > REVIEW_LOCATION_MAX_AGE_MS || fix.timestamp - now > 5_000)
    return '최근 5분 이내 위치를 확인하지 못했어요. 다시 시도해 주세요.'
  const radians = (degrees: number) => degrees * Math.PI / 180
  const a = Math.sin(radians(fix.coords.latitude - target.latitude!) / 2) ** 2
    + Math.cos(radians(target.latitude!)) * Math.cos(radians(fix.coords.latitude)) * Math.sin(radians(fix.coords.longitude - target.longitude!) / 2) ** 2
  const distance = 2 * 6_371_000 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))))
  return distance > 150 ? OUTSIDE_REVIEW_RANGE : null
}

export async function requireReviewLocation(target: ReviewPoint, { fresh = false }: { fresh?: boolean } = {}): Promise<number> {
  if (!validPoint(target)) throw new ReviewGateError('이 화장실의 위치를 확인할 수 없어 리뷰를 작성할 수 없어요.')
  if (!navigator.geolocation) throw new ReviewGateError('이 브라우저에서는 현재 위치를 확인할 수 없어요.')
  const fix = await new Promise<GeolocationPosition>((resolve, reject) => {
    // Also bound browsers that leave a permission prompt unanswered indefinitely.
    const timer = window.setTimeout(() => reject(new ReviewGateError('위치 확인이 오래 걸리고 있어요. 위치 권한을 확인하고 다시 시도해 주세요.')), 12_000)
    navigator.geolocation.getCurrentPosition(position => { window.clearTimeout(timer); resolve(position) }, error => {
      window.clearTimeout(timer)
      reject(new ReviewGateError(error.code === 1 ? '리뷰를 쓰려면 현재 위치 권한을 허용해 주세요.' : '현재 위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'))
    // A browser-owned fix within the agreed five-minute window is sufficient.
    // Explicit retry requests a new fix, not the same inaccurate cached result.
    }, { enableHighAccuracy: true, maximumAge: fresh ? 0 : REVIEW_LOCATION_MAX_AGE_MS, timeout: 10_000 })
  })
  const problem = reviewLocationProblem(target, fix)
  if (problem) throw new ReviewGateError(problem, problem === OUTSIDE_REVIEW_RANGE ? 'distance' : 'location')
  // Do not retain or transmit the user's coordinates.
  return fix.timestamp
}
