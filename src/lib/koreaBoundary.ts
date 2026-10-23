import sidoSource from '../../data/regions/sido.json' with { type: 'json' }
import { regionContains, type RegionGeometry } from './regionGeometry.ts'

// Map startup only needs the national outline. Keep the district polygons,
// translations and facility corrections out of this client import graph.
const provinceBoundaries = sidoSource.features.map(feature => ({ geometry: feature.geometry as RegionGeometry }))

export function isSouthKoreanCoordinate(longitude: number, latitude: number) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false
  return provinceBoundaries.some(province => regionContains(province, longitude, latitude))
}
