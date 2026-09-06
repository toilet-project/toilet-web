type Point = { latitude: number; longitude: number }
export type DistanceSource = 'point' | 'current-location'

export function resolveDistanceReference(source: DistanceSource, point: Point, currentLocation: Point | null) {
  return source === 'current-location' && currentLocation ? currentLocation : point
}
