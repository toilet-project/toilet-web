import { kakaoJavascriptKey } from '../config/kakao'

export type KakaoOverlay = { setMap(map: KakaoMapInstance | null): void }
export type KakaoPlace = { id: string; name: string; address: string; latitude: number; longitude: number }
export type KakaoMapInstance = {
  getBounds(): { getSouthWest(): { getLat(): number; getLng(): number }; getNorthEast(): { getLat(): number; getLng(): number } }
  getCenter(): { getLat(): number; getLng(): number }
  getLevel(): number
  getProjection(): { pointFromCoords(position: unknown): { x: number; y: number } }
  setLevel(level: number, options?: { anchor?: unknown }): void
  panTo(position: unknown): void
  relayout(): void
}

declare global {
  interface Window {
    kakao: { maps: {
      load(callback: () => void): void
      Map: new (container: HTMLElement, options: { center: unknown; level: number }) => KakaoMapInstance
      LatLng: new (latitude: number, longitude: number) => unknown
      CustomOverlay: new (options: { position: unknown; content: HTMLElement; yAnchor: number; zIndex: number }) => KakaoOverlay
      event: { addListener(map: KakaoMapInstance, event: 'idle' | 'dragstart' | 'zoom_changed' | 'click', callback: (event?: { latLng: unknown }) => void): void }
      services: {
        Places: new () => { keywordSearch(keyword: string, callback: (results: Array<{ id: string; place_name: string; address_name: string; road_address_name: string; x: string; y: string }>, status: string) => void): void }
        Status: { OK: string; ZERO_RESULT: string }
      }
    } }
  }
}

let kakaoSdkPromise: Promise<void> | undefined

function loadKakaoSdk() {
  if (window.kakao?.maps) return Promise.resolve()
  if (kakaoSdkPromise) return kakaoSdkPromise
  kakaoSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoJavascriptKey}&autoload=false&libraries=services`
    script.async = true
    script.onload = () => window.kakao.maps.load(resolve)
    script.onerror = () => reject(new Error('카카오맵 SDK를 불러오지 못했습니다.'))
    document.head.append(script)
  })
  return kakaoSdkPromise
}

export async function createKakaoMap(container: HTMLElement, center: { latitude: number; longitude: number }) {
  await loadKakaoSdk()
  return new window.kakao.maps.Map(container, { center: new window.kakao.maps.LatLng(center.latitude, center.longitude), level: 6 })
}

export async function searchKakaoPlaces(keyword: string): Promise<KakaoPlace[]> {
  await loadKakaoSdk()

  return new Promise((resolve, reject) => {
    const places = new window.kakao.maps.services.Places()
    places.keywordSearch(keyword, (results, status) => {
      if (status === window.kakao.maps.services.Status.OK) {
        resolve(results.map((place) => ({
          id: place.id,
          name: place.place_name,
          address: place.road_address_name || place.address_name,
          longitude: Number(place.x),
          latitude: Number(place.y),
        })))
        return
      }
      if (status === window.kakao.maps.services.Status.ZERO_RESULT) {
        resolve([])
        return
      }
      reject(new Error('장소 검색에 실패했습니다.'))
    })
  })
}
