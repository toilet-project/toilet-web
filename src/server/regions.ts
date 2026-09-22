import 'server-only'
import type { ToiletMapItemResponse, ToiletMapSearchResponse } from '../api/toilets'
import preciseSource from '../../data/regions/sgg-precise.json' with { type: 'json' }
import { getDistrict, regionBounds, regionContains, type Region, type RegionGeometry } from '../lib/regions'

const API_ORIGIN = process.env.TOILET_API_ORIGIN ?? 'https://api.geupddong.com'
const preciseGeometry = new Map(preciseSource.features.map(feature => [feature.properties.sgg, feature.geometry]))

export function getPreciseDistrict(provinceCode: string, districtCode: string): Region | null {
  const district = getDistrict(provinceCode, districtCode)
  if (!district) return null
  const geometry = preciseGeometry.get(districtCode)
  if (!geometry) throw new Error(`Missing precise boundary for ${districtCode}`)
  return { ...district, geometry: geometry as RegionGeometry }
}

/** Use the same visible-facility API as the public map, then clip its rectangular response to the district boundary. */
export async function getDistrictToilets(provinceCode: string, districtCode: string): Promise<ToiletMapItemResponse[]> {
  const region = getPreciseDistrict(provinceCode, districtCode)
  if (!region) return []
  const { south, north, west, east } = regionBounds(region)
  const query = new URLSearchParams({ southLat: String(south), northLat: String(north), westLng: String(west), eastLng: String(east), zoom: '8' })
  const response = await fetch(`${API_ORIGIN}/api/v1/toilets?${query}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`Region toilets: HTTP ${response.status}`)
  const result = await response.json() as ToiletMapSearchResponse
  if (result.meta?.display_type !== 'MARKER' || !Array.isArray(result.toilets)) throw new Error('Invalid region toilet response')
  return result.toilets.filter(toilet => regionContains(region, toilet.longitude, toilet.latitude))
}
