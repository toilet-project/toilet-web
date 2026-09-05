import type { ToiletDetailResponse } from '../api/toilets.ts'

export function parseToiletId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export function toiletPath(id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid toilet ID')
  return `/toilet/${id}`
}

export function regionLabel(region: ToiletDetailResponse['region']) {
  // sigunguName already includes city + district. Never derive it by parsing the address.
  return [region?.sidoName, region?.sigunguName].filter(value => value?.trim()).join(' ')
}

export function toiletCoordinates(detail: ToiletDetailResponse | null) {
  if (!detail || !Number.isFinite(detail.latitude) || !Number.isFinite(detail.longitude)) return null
  const latitude = detail.latitude as number
  const longitude = detail.longitude as number
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null
  return { latitude, longitude }
}
