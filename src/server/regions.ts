import 'server-only'
import type { ToiletMapItemResponse, ToiletMapSearchResponse } from '../api/toilets'
import { getDistrict, regionBounds, regionContains } from '../lib/regions'

const API_ORIGIN = process.env.TOILET_API_ORIGIN ?? 'https://api.geupddong.com'

/** Use the same visible-facility API as the public map, then clip its rectangular response to the district boundary. */
export async function getDistrictToilets(provinceCode: string, districtCode: string): Promise<ToiletMapItemResponse[]> {
  const region = getDistrict(provinceCode, districtCode)
  if (!region) return []
  const { south, north, west, east } = regionBounds(region)
  const query = new URLSearchParams({ southLat: String(south), northLat: String(north), westLng: String(west), eastLng: String(east), zoom: '8' })
  const response = await fetch(`${API_ORIGIN}/api/v1/toilets?${query}`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(20000) })
  if (!response.ok) throw new Error(`Region toilets: HTTP ${response.status}`)
  const result = await response.json() as ToiletMapSearchResponse
  if (result.meta?.display_type !== 'MARKER' || !Array.isArray(result.toilets)) throw new Error('Invalid region toilet response')
  return result.toilets.filter(toilet => regionContains(region, toilet.longitude, toilet.latitude))
}
