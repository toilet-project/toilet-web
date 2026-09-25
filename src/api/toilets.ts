import { createApiUrl } from '../config/api'
import { cellsForBounds, mapCellZoomSupported } from '../lib/mapCells'
import { mapClusterZoomSupported } from '../lib/mapClusters'

export type ToiletTranslationText = {
  name: string
  roadAddress: string | null
  jibunAddress: string | null
}

export type ToiletTranslations = Record<string, ToiletTranslationText>

export type ToiletMapItemResponse = {
  id: number
  name: string
  toiletType?: string
  latitude: number
  longitude: number
  displayGroupId?: number | null
  displayGroupName?: string | null
  displayGroupTranslations?: Record<string, string>
  translations?: ToiletTranslations
}

export type ToiletMapSearchResponse = {
  meta: { map_level: number; display_type: 'MARKER' | 'CLUSTER'; total_count: number; result_count: number }
  toilets: ToiletMapItemResponse[]
  clusters: Array<{ latitude: number; longitude: number; count: number }>
}

export type NormalizedOpeningHours = {
  openingPolicy: 'ALWAYS' | 'SCHEDULED' | 'IRREGULAR' | 'CLOSED' | 'UNKNOWN' | string
  open24h: boolean | null
  status: 'PARSED' | 'REVIEW_REQUIRED' | 'CONFIRMED' | string
  confidence: number | null
  parserVersion: string
  holidayPolicy: 'OPEN' | 'CLOSED' | 'UNKNOWN' | string
  manualOverride: boolean
  sourceChanged: boolean
  schedules: Array<{
    dayOfWeek: number
    slotIndex: number
    startTime: string | null
    endTime: string | null
    crossesMidnight: boolean
    closed: boolean
  }>
}

export type ToiletDetailResponse = {
  id: number
  name: string
  toiletType: string
  roadAddress: string
  jibunAddress: string
  latitude: number | null
  longitude: number | null
  region?: {
    sidoName: string | null
    sidoCode: string | null
    sigunguName: string | null
    sigunguCode: string | null
    cityName: string | null
    districtName: string | null
  } | null
  maleToiletCount: number
  maleUrinalCount: number
  maleDisabledToiletCount: number
  maleDisabledUrinalCount: number
  maleChildToiletCount: number
  maleChildUrinalCount: number
  femaleToiletCount: number
  femaleDisabledToiletCount: number
  femaleChildToiletCount: number
  agencyName: string
  phoneNumber: string
  openTime: string
  openTimeDetail: string
  normalizedOpeningHours?: NormalizedOpeningHours | null
  installationDate: string
  hasEmergencyBell: string
  emergencyBellLocation: string
  hasCctv: string
  hasDiaperTable: string
  diaperTableLocation: string
  dataBaseDate: string
  dataSource: string
  translations?: ToiletTranslations
}

export async function fetchToiletsInBounds(params: { southLat: number; northLat: number; westLng: number; eastLng: number; zoom: number; includeList?: boolean }, signal?: AbortSignal): Promise<ToiletMapSearchResponse> {
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))
  const cachedClusters = !params.includeList && mapClusterZoomSupported(params.zoom)
    && process.env.NEXT_PUBLIC_MAP_CLUSTER_CACHE_ENABLED === 'true'
  const cells = mapCellZoomSupported(params.zoom) && process.env.NEXT_PUBLIC_MAP_CELL_CACHE_ENABLED === 'true'
    ? cellsForBounds({ south: params.southLat, north: params.northLat, west: params.westLng, east: params.eastLng }) : null
  const legacyUrl = createApiUrl(`/api/v1/toilets?${query}`)
  const url = cachedClusters ? `/api/map-clusters?${query}` : cells ? `/api/map-area?${query}` : legacyUrl
  let response: Response
  try {
    response = await fetch(url, { signal })
  } catch (error) {
    // A cluster cache outage must not fan every viewport request back to the mini PC.
    if (cachedClusters || (!cells && !cachedClusters) || signal?.aborted) throw error
    response = await fetch(legacyUrl, { signal })
  }
  // Only a disabled or not-yet-deployed cluster route may use the legacy query.
  // Transient cache/source errors should not turn a busy map into an origin stampede.
  if ((cells || (cachedClusters && response.status === 404)) && !response.ok && !signal?.aborted)
    response = await fetch(legacyUrl, { signal })
  if (!response.ok) throw new Error(`화장실 조회에 실패했습니다. (${response.status})`)
  const payload = await response.json() as Partial<ToiletMapSearchResponse>
  return { meta: payload.meta ?? { map_level: params.zoom, display_type: 'MARKER', total_count: 0, result_count: 0 }, toilets: payload.toilets ?? [], clusters: payload.clusters ?? [] }
}

export async function fetchToiletDetail(toiletId: number, signal?: AbortSignal): Promise<ToiletDetailResponse> {
  const response = await fetch(createApiUrl(`/api/v1/toilets/${toiletId}`), { signal })
  if (!response.ok) throw new Error(`화장실 상세 정보를 불러오지 못했습니다. (${response.status})`)
  const detail = await response.json() as ToiletDetailResponse
  if (detail.id !== toiletId || typeof detail.name !== 'string') throw new Error('화장실 상세 응답을 확인할 수 없습니다.')
  return detail
}
