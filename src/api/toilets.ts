import { createApiUrl } from '../config/api'

export type ToiletMapSearchResponse = {
  meta: { map_level: number; display_type: 'MARKER' | 'CLUSTER'; total_count: number; result_count: number }
  toilets: Array<{ id: number; name: string; latitude: number; longitude: number }>
  clusters: Array<{ latitude: number; longitude: number; count: number }>
}

export type ToiletDetailResponse = {
  id: number
  name: string
  toiletType: string
  roadAddress: string
  jibunAddress: string
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
  installationDate: string
  hasEmergencyBell: string
  emergencyBellLocation: string
  hasCctv: string
  hasDiaperTable: string
  diaperTableLocation: string
  dataBaseDate: string
  dataSource: string
}

export async function fetchToiletsInBounds(params: { southLat: number; northLat: number; westLng: number; eastLng: number; zoom: number }): Promise<ToiletMapSearchResponse> {
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))
  const response = await fetch(createApiUrl(`/api/v1/toilets?${query}`))
  if (!response.ok) throw new Error(`화장실 조회에 실패했습니다. (${response.status})`)
  const payload = await response.json() as Partial<ToiletMapSearchResponse>
  return { meta: payload.meta ?? { map_level: params.zoom, display_type: 'MARKER', total_count: 0, result_count: 0 }, toilets: payload.toilets ?? [], clusters: payload.clusters ?? [] }
}

export async function fetchToiletDetail(toiletId: number): Promise<ToiletDetailResponse> {
  const response = await fetch(createApiUrl(`/api/v1/toilets/${toiletId}`))
  if (!response.ok) throw new Error(`화장실 상세 정보를 불러오지 못했습니다. (${response.status})`)
  return response.json() as Promise<ToiletDetailResponse>
}
