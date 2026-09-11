import type { ToiletDetailResponse } from '../api/toilets'

export const REVIEW_TEST_TOILET_ID = -1

/** An opt-in browser fixture, never a facility record or a location attestation. */
export function readReviewTestToilet(hash: string, enabled: boolean): ToiletDetailResponse | null {
  if (!enabled || hash.length > 160) return null
  const match = /^#review-test=(-?\d{1,3}(?:\.\d{1,8})?),(-?\d{1,3}(?:\.\d{1,8})?)$/.exec(hash)
  if (!match) return null
  const latitude = Number(match[1]), longitude = Number(match[2])
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return {
    id: REVIEW_TEST_TOILET_ID, name: '리뷰 테스트 화장실', toiletType: '테스트 · 실제 시설 아님',
    latitude, longitude, roadAddress: '', jibunAddress: '',
    maleToiletCount: 0, maleUrinalCount: 0, maleDisabledToiletCount: 0, maleDisabledUrinalCount: 0,
    maleChildToiletCount: 0, maleChildUrinalCount: 0, femaleToiletCount: 0,
    femaleDisabledToiletCount: 0, femaleChildToiletCount: 0,
    agencyName: '', phoneNumber: '', openTime: '', openTimeDetail: '', installationDate: '',
    hasEmergencyBell: '', emergencyBellLocation: '', hasCctv: '', hasDiaperTable: '',
    diaperTableLocation: '', dataBaseDate: '', dataSource: 'browser-only-review-fixture',
  }
}

export function getReviewTestHash() {
  if (typeof window === 'undefined') return ''
  const hash = window.location.hash
  return readReviewTestToilet(hash, process.env.NEXT_PUBLIC_REVIEW_DESIGN_PREVIEW === 'true') ? hash : ''
}

export function subscribeReviewTestHash(changed: () => void) {
  window.addEventListener('hashchange', changed)
  return () => window.removeEventListener('hashchange', changed)
}
