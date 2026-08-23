import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchToiletsInBounds, type ToiletMapSearchResponse } from './api/toilets'
import { createKakaoMap, type KakaoMapInstance, type KakaoOverlay } from './lib/kakaoMap'
import './App.css'

const DAEJEON_CITY_HALL = { latitude: 36.3504, longitude: 127.3845 }
const CLUSTER_GRID_SIZE = 84

type MapPoint = { latitude: number; longitude: number; count: number; name?: string }
type SelectedToilet = { name: string; latitude: number; longitude: number }
type CardPosition = { left: number; top: number }

const PLACE_CARD_WIDTH = 360
const PLACE_CARD_HEIGHT = 224
const MAP_EDGE_GAP = 18

function groupPointsByScreenGrid(map: KakaoMapInstance, points: MapPoint[]) {
  const groups = new Map<string, { latitude: number; longitude: number; count: number; name?: string }>()
  const projection = map.getProjection()

  for (const point of points) {
    const projected = projection.pointFromCoords(new window.kakao.maps.LatLng(point.latitude, point.longitude))
    const key = `${Math.floor(projected.x / CLUSTER_GRID_SIZE)}:${Math.floor(projected.y / CLUSTER_GRID_SIZE)}`
    const current = groups.get(key)
    if (current) {
      current.latitude += point.latitude * point.count
      current.longitude += point.longitude * point.count
      current.count += point.count
    } else {
      groups.set(key, { latitude: point.latitude * point.count, longitude: point.longitude * point.count, count: point.count, name: point.name })
    }
  }

  return [...groups.values()].map((group) => ({
    latitude: group.latitude / group.count,
    longitude: group.longitude / group.count,
    count: group.count,
    name: group.count === 1 ? group.name : undefined,
  }))
}

function App() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMapInstance | null>(null)
  const overlaysRef = useRef<KakaoOverlay[]>([])
  const currentLocationOverlayRef = useRef<KakaoOverlay | null>(null)
  const requestSequenceRef = useRef(0)
  const selectedToiletRef = useRef<SelectedToilet | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ToiletMapSearchResponse | null>(null)
  const [selectedToilet, setSelectedToilet] = useState<SelectedToilet | null>(null)
  const [placeCardPosition, setPlaceCardPosition] = useState<CardPosition | null>(null)
  const [locationMessage, setLocationMessage] = useState<string | null>(null)
  const [isLocating, setIsLocating] = useState(false)

  const clearOverlays = useCallback(() => {
    overlaysRef.current.forEach((overlay) => overlay.setMap(null))
    overlaysRef.current = []
  }, [])

  const positionPlaceCardFromMarker = useCallback((marker: HTMLElement) => {
    const container = mapContainerRef.current
    if (!container) return

    const markerRect = marker.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const markerCenter = markerRect.left - containerRect.left + (markerRect.width / 2)
    const markerTop = markerRect.top - containerRect.top
    const left = Math.min(Math.max(MAP_EDGE_GAP, markerCenter - (PLACE_CARD_WIDTH / 2)), Math.max(MAP_EDGE_GAP, container.clientWidth - PLACE_CARD_WIDTH - MAP_EDGE_GAP))
    const top = Math.min(Math.max(MAP_EDGE_GAP, markerTop - PLACE_CARD_HEIGHT - MAP_EDGE_GAP), Math.max(MAP_EDGE_GAP, container.clientHeight - PLACE_CARD_HEIGHT - MAP_EDGE_GAP))
    setPlaceCardPosition({ left, top })
  }, [])

  const renderResult = useCallback((map: KakaoMapInstance, response: ToiletMapSearchResponse) => {
    clearOverlays()

    const points: MapPoint[] = response.meta.display_type === 'CLUSTER'
      ? response.clusters
      : response.toilets.map((toilet) => ({ ...toilet, count: 1 }))
    const displayPoints = map.getLevel() >= 5 || response.meta.display_type === 'CLUSTER'
      ? groupPointsByScreenGrid(map, points)
      : points

    overlaysRef.current = displayPoints.map((point) => {
      if (point.count > 1) {
        const content = document.createElement('button')
        content.className = 'cluster-marker'
        content.type = 'button'
        content.textContent = String(point.count)
        content.setAttribute('aria-label', `${point.count}개의 화장실이 있는 구역 확대하기`)
        content.addEventListener('click', () => {
          map.setLevel(Math.max(1, map.getLevel() - 2), { anchor: new window.kakao.maps.LatLng(point.latitude, point.longitude) })
          map.panTo(new window.kakao.maps.LatLng(point.latitude, point.longitude))
        })

        return new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(point.latitude, point.longitude),
          content,
          yAnchor: 0.5,
          zIndex: 2,
        })
      }

      const content = document.createElement('button')
      content.className = 'toilet-marker'
      content.type = 'button'
      content.innerHTML = '<span aria-hidden="true">🚻</span>'
      const toiletName = point.name ?? '공중화장실'
      content.setAttribute('aria-label', toiletName)
      content.addEventListener('click', () => {
        selectedToiletRef.current = { name: toiletName, latitude: point.latitude, longitude: point.longitude }
        setSelectedToilet(selectedToiletRef.current)
        positionPlaceCardFromMarker(content)
      })

      return new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(point.latitude, point.longitude),
        content,
        yAnchor: 1,
        zIndex: 1,
      })
    })

    overlaysRef.current.forEach((overlay) => overlay.setMap(map))
  }, [clearOverlays, positionPlaceCardFromMarker])

  const loadMapArea = useCallback(async () => {
    const map = mapRef.current
    if (!map) return

    const requestSequence = ++requestSequenceRef.current
    const bounds = map.getBounds()
    const southWest = bounds.getSouthWest()
    const northEast = bounds.getNorthEast()

    setIsLoading(true)
    setError(null)
    try {
      const response = await fetchToiletsInBounds({
        southLat: southWest.getLat(),
        northLat: northEast.getLat(),
        westLng: southWest.getLng(),
        eastLng: northEast.getLng(),
        zoom: map.getLevel(),
      })

      if (requestSequence !== requestSequenceRef.current) return
      setResult(response)
      renderResult(map, response)
    } catch {
      if (requestSequence === requestSequenceRef.current) {
        setError('화장실 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
      }
    } finally {
      if (requestSequence === requestSequenceRef.current) setIsLoading(false)
    }
  }, [renderResult])

  const moveToCurrentLocation = useCallback(async (isInitialRequest = false) => {
    const map = mapRef.current
    if (!map) return

    if (!navigator.geolocation) {
      setIsLocating(false)
      return
    }

    if (!isInitialRequest) setIsLocating(true)
    try {
      if ('permissions' in navigator) {
        const permission = await navigator.permissions.query({ name: 'geolocation' })
        if (permission.state === 'denied') {
          setLocationMessage('현재 위치 권한이 차단되어 있습니다. Chrome 주소창 왼쪽의 사이트 설정에서 위치를 허용한 뒤 다시 시도해 주세요.')
          setIsLocating(false)
          return
        }
      }
    } catch {
      // Permissions API를 지원하지 않는 브라우저는 Geolocation 요청으로 바로 진행한다.
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const position = new window.kakao.maps.LatLng(coords.latitude, coords.longitude)
        currentLocationOverlayRef.current?.setMap(null)

        const content = document.createElement('div')
        content.className = 'current-location-marker'
        content.innerHTML = '<span aria-hidden="true"></span><span class="sr-only">현재 위치</span>'
        currentLocationOverlayRef.current = new window.kakao.maps.CustomOverlay({
          position,
          content,
          yAnchor: 0.5,
          zIndex: 3,
        })
        currentLocationOverlayRef.current.setMap(map)
        map.setLevel(Math.min(map.getLevel(), 4))
        map.panTo(position)
        setLocationMessage(null)
        setIsLocating(false)
      },
      (positionError) => {
        const messageByCode: Record<number, string> = {
          1: '위치 권한이 거부되었습니다. 브라우저 주소창의 위치 권한을 허용한 뒤 다시 시도해 주세요.',
          2: '현재 위치를 확인할 수 없습니다. GPS·Wi‑Fi 연결을 확인해 주세요.',
          3: '위치 확인 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
        }
        if (positionError.code === 1) {
          setLocationMessage(messageByCode[positionError.code] ?? '현재 위치를 확인하지 못했습니다.')
        }
        setIsLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    )
  }, [])

  useEffect(() => {
    let disposed = false
    let resizeObserver: ResizeObserver | undefined

    async function initialize() {
      if (!mapContainerRef.current) return

      try {
        const map = await createKakaoMap(mapContainerRef.current, DAEJEON_CITY_HALL)
        if (disposed) return
        mapRef.current = map
        window.kakao.maps.event.addListener(map, 'idle', loadMapArea)
        resizeObserver = new ResizeObserver(() => map.relayout())
        resizeObserver.observe(mapContainerRef.current)
        await loadMapArea()
        void moveToCurrentLocation(true)
      } catch (caughtError) {
        setIsLoading(false)
        setError(caughtError instanceof Error ? caughtError.message : '지도를 불러오지 못했습니다.')
      }
    }

    void initialize()
    return () => {
      disposed = true
      clearOverlays()
      currentLocationOverlayRef.current?.setMap(null)
      resizeObserver?.disconnect()
    }
  }, [clearOverlays, loadMapArea, moveToCurrentLocation])

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="급똥 지도 홈">급똥</a>
        <span className="subtitle">내 주변 공중화장실 찾기</span>
      </header>

      <section className="map-section" aria-label="공중화장실 지도">
        <div ref={mapContainerRef} className="map" />
        <button className={`location-button${selectedToilet ? ' is-with-card' : ''}`} type="button" onClick={() => void moveToCurrentLocation()} disabled={isLocating}>
          {isLocating ? '확인 중' : '현재 위치'}
        </button>
        <div className="map-hud" aria-live="polite">
          {isLoading && <span>지도를 조회하는 중…</span>}
          {!isLoading && result && <span>이 지역 {result.meta.total_count.toLocaleString()}곳{result.meta.display_type === 'CLUSTER' ? ' · 묶어서 표시 중' : ''}</span>}
          {error && <span className="error-message">{error}</span>}
        </div>
        {locationMessage && <p className="location-message" role="status">{locationMessage}</p>}
        {selectedToilet && (
          <aside className="place-card" aria-live="polite" style={placeCardPosition ? { left: placeCardPosition.left, top: placeCardPosition.top } : undefined}>
            <button type="button" className="close-button" onClick={() => { selectedToiletRef.current = null; setSelectedToilet(null); setPlaceCardPosition(null) }} aria-label="정보 닫기">×</button>
            <span className="card-label">공중화장실</span>
            <strong>{selectedToilet.name}</strong>
            <p>마커를 선택했습니다. 상세 정보 조회는 다음 작업에서 연결합니다.</p>
          </aside>
        )}
      </section>
      <footer>지도 이동 또는 확대/축소 후 이 영역의 화장실을 다시 조회합니다.</footer>
    </main>
  )
}

export default App
