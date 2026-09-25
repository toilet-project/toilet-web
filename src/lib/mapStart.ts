import { isSouthKoreanCoordinate } from './regions.ts'

export type MapCoordinates = { latitude: number; longitude: number }

// Seoul Station's map center, cross-checked against the Korea National Railway
// station dataset in data/place-search/place-search-seed-20260920.ndjson.
export const SEOUL_STATION = { latitude: 37.557863, longitude: 126.969468 }

export function isKoreanMapLocation(point: MapCoordinates | null | undefined): point is MapCoordinates {
  return Boolean(point && isSouthKoreanCoordinate(point.longitude, point.latitude))
}

export function initialMapLocation(point: MapCoordinates | null | undefined) {
  return isKoreanMapLocation(point)
    ? { center: point, usedFallback: false }
    : { center: SEOUL_STATION, usedFallback: true }
}
