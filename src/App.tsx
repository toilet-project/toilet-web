import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchToiletsInBounds, type ToiletMapSearchResponse } from './api/toilets'
import { createKakaoMap, type KakaoMapInstance, type KakaoOverlay } from './lib/kakaoMap'
import './App.css'

const DAEJEON_CITY_HALL = { latitude: 36.3504, longitude: 127.3845 }

function App() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMapInstance | null>(null)
  const overlaysRef = useRef<KakaoOverlay[]>([])
  const currentLocationOverlayRef = useRef<KakaoOverlay | null>(null)
  const requestSequenceRef = useRef(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ToiletMapSearchResponse | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [locationMessage, setLocationMessage] = useState<string | null>(null)
  const [isLocating, setIsLocating] = useState(false)

  const clearOverlays = useCallback(() => {
    overlaysRef.current.forEach((overlay) => overlay.setMap(null))
    overlaysRef.current = []
  }, [])

  const renderResult = useCallback((map: KakaoMapInstance, response: ToiletMapSearchResponse) => {
    clearOverlays()

    if (response.meta.display_type === 'CLUSTER') {
      overlaysRef.current = response.clusters.map((cluster) => {
        const content = document.createElement('button')
        content.className = 'cluster-marker'
        content.type = 'button'
        content.textContent = String(cluster.count)
        content.setAttribute('aria-label', `${cluster.count}개의 화장실이 있는 구역 확대하기`)
        content.addEventListener('click', () => {
          map.setLevel(Math.max(1, map.getLevel() - 3), { anchor: new window.kakao.maps.LatLng(cluster.latitude, cluster.longitude) })
          map.panTo(new window.kakao.maps.LatLng(cluster.latitude, cluster.longitude))
        })

        return new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(cluster.latitude, cluster.longitude),
          content,
          yAnchor: 0.5,
          zIndex: 2,
        })
      })
    } else {
      overlaysRef.current = response.toilets.map((toilet) => {
        const content = document.createElement('button')
        content.className = 'toilet-marker'
        content.type = 'button'
        content.innerHTML = '<span aria-hidden="true">🚻</span>'
        content.setAttribute('aria-label', toilet.name)
        content.addEventListener('click', () => setSelectedName(toilet.name))

        return new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(toilet.latitude, toilet.longitude),
          content,
          yAnchor: 1,
          zIndex: 1,
        })
      })
    }

    overlaysRef.current.forEach((overlay) => overlay.setMap(map))
  }, [clearOverlays])

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

  const moveToCurrentLocation = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    if (!navigator.geolocation) {
      setLocationMessage('이 브라우저에서는 현재 위치 기능을 지원하지 않습니다.')
      return
    }

    setIsLocating(true)
    setLocationMessage('현재 위치 권한을 요청하고 있습니다…')
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
        setLocationMessage('현재 위치 주변 화장실을 표시합니다.')
        setIsLocating(false)
      },
      (positionError) => {
        const messageByCode: Record<number, string> = {
          1: '위치 권한이 거부되었습니다. 브라우저 주소창의 위치 권한을 허용한 뒤 다시 시도해 주세요.',
          2: '현재 위치를 확인할 수 없습니다. GPS·Wi‑Fi 연결을 확인해 주세요.',
          3: '위치 확인 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
        }
        setLocationMessage(messageByCode[positionError.code] ?? '현재 위치를 확인하지 못했습니다.')
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
  }, [clearOverlays, loadMapArea])

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="급똥 지도 홈">급똥</a>
        <span className="subtitle">내 주변 공중화장실 찾기</span>
      </header>

      <section className="map-section" aria-label="공중화장실 지도">
        <div ref={mapContainerRef} className="map" />
        <button className="location-button" type="button" onClick={moveToCurrentLocation} disabled={isLocating}>
          <span aria-hidden="true">⌖</span>
          {isLocating ? '위치 확인 중' : '현재 위치'}
        </button>
        <div className="map-hud" aria-live="polite">
          {isLoading && <span>지도를 조회하는 중…</span>}
          {!isLoading && result && <span>이 지역 {result.meta.total_count.toLocaleString()}곳{result.meta.display_type === 'CLUSTER' ? ' · 묶어서 표시 중' : ''}</span>}
          {error && <span className="error-message">{error}</span>}
        </div>
        {locationMessage && <p className="location-message" role="status">{locationMessage}</p>}
        {selectedName && (
          <aside className="place-card" aria-live="polite">
            <button type="button" className="close-button" onClick={() => setSelectedName(null)} aria-label="정보 닫기">×</button>
            <span className="card-label">공중화장실</span>
            <strong>{selectedName}</strong>
            <p>마커를 선택했습니다. 상세 정보 조회는 다음 작업에서 연결합니다.</p>
          </aside>
        )}
      </section>
      <footer>지도 이동 또는 확대/축소 후 이 영역의 화장실을 다시 조회합니다.</footer>
    </main>
  )
}

export default App
