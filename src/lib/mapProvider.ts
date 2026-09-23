import type { Locale } from '../i18n/locale'
import { createKakaoMap, type KakaoMapInstance, type KakaoOverlay } from './kakaoMap'
import {
  loadedNaverMapLanguage,
  mapLevelFromNaverZoom,
  naverMapLanguageForLocale,
  naverMapLanguageNeedsReload,
  naverZoomFromLevel,
  resolveMapProvider,
  type MapProvider,
  type MapProviderPreference,
  type NaverMapLanguage,
} from './mapProviderSelection'

export { mapLevelFromNaverZoom, naverZoomFromLevel, resolveMapProvider } from './mapProviderSelection'
export { loadedNaverMapLanguage } from './mapProviderSelection'
export type { MapProvider, MapProviderPreference } from './mapProviderSelection'

export type MapCoordinate = {
  getLat(): number
  getLng(): number
  readonly raw: unknown
}
export type MapBounds = {
  getSouthWest(): MapCoordinate
  getNorthEast(): MapCoordinate
}
export type MapEvent = { latLng?: MapCoordinate }
export type MapEventName = 'idle' | 'dragstart' | 'zoom_changed' | 'click'
export type MapOverlay = { setMap(map: MapInstance | null): void }
export type MapInstance = {
  readonly provider: MapProvider
  readonly raw: unknown
  getBounds(): MapBounds
  getCenter(): MapCoordinate
  setCenter(position: MapCoordinate): void
  getLevel(): number
  getProjection(): { pointFromCoords(position: MapCoordinate): { x: number; y: number } }
  setLevel(level: number, options?: { anchor?: MapCoordinate }): void
  panTo(position: MapCoordinate): void
  setDraggable(draggable: boolean): void
  setZoomable(zoomable: boolean): void
  relayout(): void
}

type NaverCoordinate = { lat(): number; lng(): number }
type NaverPoint = { x: number; y: number }
type NaverMap = {
  getBounds(): { getSW(): NaverCoordinate; getNE(): NaverCoordinate }
  getCenter(): NaverCoordinate
  setCenter(position: NaverCoordinate): void
  getZoom(): number
  setZoom(zoom: number): void
  panTo(position: NaverCoordinate): void
  setOptions(name: string, value: boolean): void
  autoResize(): void
  destroy(): void
  getProjection(): { fromCoordToOffset(position: NaverCoordinate): NaverPoint }
}
type NaverMapEvent = { coord?: NaverCoordinate; latlng?: NaverCoordinate }
type NaverEventListener = object
type NaverMapPanes = { overlayLayer: HTMLElement }
type NaverProjection = { fromCoordToOffset(position: NaverCoordinate): NaverPoint }
type NaverOverlayBase = {
  setMap(map: NaverMap | null): void
  getMap(): NaverMap | null
  getPanes(): NaverMapPanes
  getProjection(): NaverProjection
}

declare global {
  interface Window {
    naver?: { maps: {
      Map: new (container: HTMLElement, options: { center: NaverCoordinate; zoom: number; minZoom?: number; maxZoom?: number }) => NaverMap
      LatLng: new (latitude: number, longitude: number) => NaverCoordinate
      OverlayView: new () => NaverOverlayBase
      Event: {
        addListener(map: NaverMap, event: MapEventName, callback: (event?: NaverMapEvent) => void): NaverEventListener
        removeListener(listener: NaverEventListener): void
      }
    } }
  }
}

type MapProviderConfig = { provider?: string; clientId?: string }
type OverlayOptions = {
  position: MapCoordinate
  content: HTMLElement
  yAnchor: number
  zIndex: number
  clickable?: boolean
}

let naverSdkPromise: Promise<void> | undefined

export class NaverMapLanguageReloadRequired extends Error {
  constructor() { super('네이버 지도 언어 변경에는 페이지 새로고침이 필요합니다.') }
}

function kakaoCoordinate(raw: unknown): MapCoordinate {
  const coordinate = raw as { getLat(): number; getLng(): number }
  return { raw, getLat: () => coordinate.getLat(), getLng: () => coordinate.getLng() }
}

function naverCoordinate(raw: NaverCoordinate): MapCoordinate {
  return { raw, getLat: () => raw.lat(), getLng: () => raw.lng() }
}

function kakaoAdapter(raw: KakaoMapInstance): MapInstance {
  return {
    provider: 'kakao',
    raw,
    getBounds: () => {
      const bounds = raw.getBounds()
      return {
        getSouthWest: () => kakaoCoordinate(bounds.getSouthWest()),
        getNorthEast: () => kakaoCoordinate(bounds.getNorthEast()),
      }
    },
    getCenter: () => kakaoCoordinate(raw.getCenter()),
    setCenter: position => raw.setCenter(position.raw),
    getLevel: () => raw.getLevel(),
    getProjection: () => ({
      pointFromCoords: position => raw.getProjection().pointFromCoords(position.raw),
    }),
    setLevel: (level, options) => raw.setLevel(level, options?.anchor ? { anchor: options.anchor.raw } : undefined),
    panTo: position => raw.panTo(position.raw),
    setDraggable: draggable => raw.setDraggable(draggable),
    setZoomable: zoomable => raw.setZoomable(zoomable),
    relayout: () => raw.relayout(),
  }
}

function naverAdapter(raw: NaverMap): MapInstance {
  return {
    provider: 'naver',
    raw,
    getBounds: () => {
      const bounds = raw.getBounds()
      return {
        getSouthWest: () => naverCoordinate(bounds.getSW()),
        getNorthEast: () => naverCoordinate(bounds.getNE()),
      }
    },
    getCenter: () => naverCoordinate(raw.getCenter()),
    setCenter: position => raw.setCenter(position.raw as NaverCoordinate),
    getLevel: () => mapLevelFromNaverZoom(raw.getZoom()),
    getProjection: () => ({
      pointFromCoords: position => raw.getProjection().fromCoordToOffset(position.raw as NaverCoordinate),
    }),
    setLevel: level => raw.setZoom(naverZoomFromLevel(level)),
    panTo: position => raw.panTo(position.raw as NaverCoordinate),
    setDraggable: draggable => raw.setOptions('draggable', draggable),
    setZoomable: zoomable => {
      raw.setOptions('scrollWheel', zoomable)
      raw.setOptions('pinchZoom', zoomable)
      raw.setOptions('doubleClickZoom', zoomable)
    },
    relayout: () => raw.autoResize(),
  }
}

async function fetchNaverClientId() {
  const response = await fetch('/api/map-provider-config', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('영문 지도 설정을 불러오지 못했습니다.')
  const config = await response.json() as MapProviderConfig
  if (config.provider !== 'naver' || !config.clientId) throw new Error('영문 지도 설정이 올바르지 않습니다.')
  return config.clientId
}

async function loadNaverSdk(language: NaverMapLanguage, signal?: AbortSignal) {
  if (naverMapLanguageNeedsReload(loadedNaverMapLanguage(), language)) throw new NaverMapLanguageReloadRequired()
  if (window.naver?.maps?.Map) return
  if (!naverSdkPromise) {
    // The SDK is shared across maps. Unmounting one map must not cancel the
    // configuration request that another map is already waiting for.
    naverSdkPromise = fetchNaverClientId().then(clientId => new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-geupddong-map-provider="naver"]')
      const script = existing ?? document.createElement('script')
      if (!existing) {
        script.dataset.geupddongMapProvider = 'naver'
        script.dataset.geupddongMapLanguage = language
        script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&language=${language}`
        script.async = true
        document.head.append(script)
      }
      const loaded = () => window.naver?.maps?.Map ? resolve() : reject(new Error('네이버 지도 SDK를 초기화하지 못했습니다.'))
      if (window.naver?.maps?.Map) resolve()
      else {
        script.addEventListener('load', loaded, { once: true })
        script.addEventListener('error', () => reject(new Error('네이버 지도 SDK를 불러오지 못했습니다.')), { once: true })
      }
    })).catch(error => {
      naverSdkPromise = undefined
      throw error
    })
  }
  await naverSdkPromise
  signal?.throwIfAborted()
  if (naverMapLanguageNeedsReload(loadedNaverMapLanguage(), language)) throw new NaverMapLanguageReloadRequired()
}

export async function createMap(
  container: HTMLElement,
  center: { latitude: number; longitude: number },
  level: number,
  locale: Locale,
  signal?: AbortSignal,
  preference: MapProviderPreference = 'auto',
): Promise<MapInstance> {
  const provider = resolveMapProvider(locale, preference)
  if (provider === 'kakao') return kakaoAdapter(await createKakaoMap(container, center, level, signal))

  await loadNaverSdk(naverMapLanguageForLocale(locale), signal)
  const maps = window.naver?.maps
  if (!maps) throw new Error('네이버 지도 SDK를 초기화하지 못했습니다.')
  const raw = new maps.Map(container, {
    center: new maps.LatLng(center.latitude, center.longitude),
    zoom: naverZoomFromLevel(level),
    minZoom: 5,
    maxZoom: 20,
  })
  return naverAdapter(raw)
}

export function createMapCoordinate(map: MapInstance, latitude: number, longitude: number): MapCoordinate {
  if (map.provider === 'kakao') return kakaoCoordinate(new window.kakao.maps.LatLng(latitude, longitude))
  const maps = window.naver?.maps
  if (!maps) throw new Error('네이버 지도 SDK가 준비되지 않았습니다.')
  return naverCoordinate(new maps.LatLng(latitude, longitude))
}

export function createMapOverlay(map: MapInstance, options: OverlayOptions): MapOverlay {
  if (map.provider === 'kakao') {
    const overlay: KakaoOverlay = new window.kakao.maps.CustomOverlay({
      ...options,
      position: options.position.raw,
    })
    return { setMap: nextMap => overlay.setMap(nextMap ? nextMap.raw as KakaoMapInstance : null) }
  }

  const maps = window.naver?.maps
  if (!maps) throw new Error('네이버 지도 SDK가 준비되지 않았습니다.')
  const position = options.position.raw as NaverCoordinate
  const element = document.createElement('div')
  element.style.position = 'absolute'
  element.style.left = '0'
  element.style.top = '0'
  element.style.zIndex = String(options.zIndex)
  element.style.transform = `translate(-50%, -${Math.round(options.yAnchor * 100)}%)`
  element.append(options.content)

  class HtmlOverlay extends maps.OverlayView {
    onAdd() { this.getPanes().overlayLayer.append(element) }
    draw() {
      if (!this.getMap()) return
      const point = this.getProjection().fromCoordToOffset(position)
      element.style.left = `${point.x}px`
      element.style.top = `${point.y}px`
    }
    onRemove() { element.remove() }
  }

  const overlay = new HtmlOverlay()
  return { setMap: nextMap => overlay.setMap(nextMap ? nextMap.raw as NaverMap : null) }
}

export function addMapEventListener(map: MapInstance, event: MapEventName, callback: (event?: MapEvent) => void) {
  if (map.provider === 'kakao') {
    const rawMap = map.raw as KakaoMapInstance
    const listener = (kakaoEvent?: { latLng: { getLat(): number; getLng(): number } }) => {
      callback(kakaoEvent?.latLng ? { latLng: kakaoCoordinate(kakaoEvent.latLng) } : undefined)
    }
    window.kakao.maps.event.addListener(rawMap, event, listener)
    return () => window.kakao.maps.event.removeListener?.(rawMap, event, listener)
  }

  const maps = window.naver?.maps
  if (!maps) return () => undefined
  const listener = maps.Event.addListener(map.raw as NaverMap, event, naverEvent => {
    const coordinate = naverEvent?.coord ?? naverEvent?.latlng
    callback(coordinate ? { latLng: naverCoordinate(coordinate) } : undefined)
  })
  return () => maps.Event.removeListener(listener)
}

export function preventMapEvent(map: MapInstance | null) {
  if (map?.provider === 'kakao') window.kakao.maps.event.preventMap()
}

export function destroyMap(map: MapInstance) {
  if (map.provider === 'naver') (map.raw as NaverMap).destroy()
}
