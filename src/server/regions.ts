import 'server-only'
import type { ToiletMapItemResponse, ToiletMapSearchResponse } from '../api/toilets'
import preciseSource from '../../data/regions/sgg-precise.json' with { type: 'json' }
import { allDistricts, getDistrict, regionBounds, regionContains, type Region, type RegionGeometry } from '../lib/regions'
import type { RegionBounds } from './cacheRevalidation'
import { getRegionMarkerBucket, readRegionMarkersOrFallback, RegionMarkerOriginError, type RegionMarkerRead } from './regionMarkerCache'

const API_ORIGIN = process.env.TOILET_API_ORIGIN ?? 'https://api.geupddong.com'
const preciseGeometry = new Map(preciseSource.features.map(feature => [feature.properties.sgg, feature.geometry]))
const preciseDistricts = allDistricts().flatMap(district => {
  const geometry = preciseGeometry.get(district.code)
  return geometry ? [{ region: { ...district, geometry: geometry as RegionGeometry },
    bounds: regionBounds({ ...district, geometry: geometry as RegionGeometry }) }] : []
})

/** Conservative envelope matching uses the same precise boundaries as district map clipping. */
export function districtCodesOverlappingBounds(bounds: RegionBounds): string[] {
  const point = bounds.west === bounds.east && bounds.south === bounds.north
  return preciseDistricts.filter(({ region, bounds: district }) => point
    ? regionContains(region, bounds.west, bounds.south)
    : district.west <= bounds.east && district.east >= bounds.west
      && district.south <= bounds.north && district.north >= bounds.south).map(({ region }) => region.code)
}

export function getPreciseDistrict(provinceCode: string, districtCode: string): Region | null {
  const district = getDistrict(provinceCode, districtCode)
  if (!district) return null
  const geometry = preciseGeometry.get(districtCode)
  if (!geometry) throw new Error(`Missing precise boundary for ${districtCode}`)
  return { ...district, geometry: geometry as RegionGeometry }
}

/** Keep only public marker fields in the deployment-independent district cache. */
export function sanitizeDistrictMarkers(value: unknown, region: Region): ToiletMapItemResponse[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid region toilet response')
  const response = value as Partial<ToiletMapSearchResponse>
  const empty = response.toilets == null && response.meta?.total_count === 0 && response.meta?.result_count === 0
  if (response.meta?.display_type !== 'MARKER' || (!Array.isArray(response.toilets) && !empty))
    throw new Error('Invalid region toilet response')
  return (empty ? [] : response.toilets as ToiletMapItemResponse[]).flatMap(raw => {
    if (!raw || !Number.isSafeInteger(raw.id) || raw.id < 1 || typeof raw.name !== 'string'
      || !Number.isFinite(raw.latitude) || !Number.isFinite(raw.longitude))
      throw new Error('Invalid region toilet marker')
    if (!regionContains(region, raw.longitude, raw.latitude)) return []
    const translations: NonNullable<ToiletMapItemResponse['translations']> = {}
    if (raw.translations && typeof raw.translations === 'object' && !Array.isArray(raw.translations)) {
      for (const [locale, text] of Object.entries(raw.translations)) {
        if (/^[a-z]{2,3}(?:-[a-zA-Z]{2})?$/.test(locale) && text && typeof text.name === 'string' && text.name.trim())
          translations[locale] = { name: text.name.trim(), roadAddress: null, jibunAddress: null }
      }
    }
    const groupNames: Record<string, string> = {}
    if (raw.displayGroupTranslations && typeof raw.displayGroupTranslations === 'object'
      && !Array.isArray(raw.displayGroupTranslations)) {
      for (const [locale, name] of Object.entries(raw.displayGroupTranslations))
        if (/^[a-z]{2,3}(?:-[a-zA-Z]{2})?$/.test(locale) && typeof name === 'string' && name.trim())
          groupNames[locale] = name.trim()
    }
    return [{ id: raw.id, name: raw.name, latitude: raw.latitude, longitude: raw.longitude,
      toiletType: typeof raw.toiletType === 'string' ? raw.toiletType : undefined,
      displayGroupId: Number.isSafeInteger(raw.displayGroupId) ? raw.displayGroupId : null,
      displayGroupName: typeof raw.displayGroupName === 'string' ? raw.displayGroupName : null,
      translations: Object.keys(translations).length ? translations : undefined,
      displayGroupTranslations: Object.keys(groupNames).length ? groupNames : undefined }]
  })
}

/** Use the public map API once per cache generation, then clip to the precise district boundary. */
export async function getDistrictToiletsWithSource(provinceCode: string, districtCode: string): Promise<RegionMarkerRead> {
  const region = getPreciseDistrict(provinceCode, districtCode)
  if (!region) return { toilets: [], source: 'hit' }
  const { south, north, west, east } = regionBounds(region)
  const query = new URLSearchParams({ southLat: String(south), northLat: String(north), westLng: String(west), eastLng: String(east), zoom: '8' })
  const fetchOrigin = async (shared: boolean) => {
    try {
      const response = await fetch(`${API_ORIGIN}/api/v1/toilets?${query}`, {
        ...(shared ? { cache: 'no-store' as const } : {
          next: { revalidate: 2_592_000, tags: ['region-markers', `region-markers:${districtCode}`] },
        }),
        signal: AbortSignal.timeout(20000),
      })
      if (!response.ok) throw new Error(`Region toilets: HTTP ${response.status}`)
      return sanitizeDistrictMarkers(await response.json(), region)
    } catch (error) { throw new RegionMarkerOriginError('Region origin unavailable', { cause: error }) }
  }
  let bucket = null
  if (process.env.REGION_MARKER_CACHE_ENABLED === 'true') {
    try { bucket = await getRegionMarkerBucket() }
    catch { return { toilets: await fetchOrigin(false), source: 'fallback' } }
  }
  if (bucket) return readRegionMarkersOrFallback({ bucket, districtCode, fetchOrigin: () => fetchOrigin(true) },
    () => fetchOrigin(false))
  return { toilets: await fetchOrigin(false), source: 'miss' }
}

export async function getDistrictToilets(provinceCode: string, districtCode: string): Promise<ToiletMapItemResponse[]> {
  return (await getDistrictToiletsWithSource(provinceCode, districtCode)).toilets
}
