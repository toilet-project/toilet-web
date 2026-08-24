import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fetchToiletDetail, fetchToiletsInBounds, type ToiletDetailResponse, type ToiletMapSearchResponse } from './api/toilets'
import { createKakaoMap, type KakaoMapInstance, type KakaoOverlay } from './lib/kakaoMap'
import './App.css'

const DAEJEON_CITY_HALL = { latitude: 36.3504, longitude: 127.3845 }
const CLUSTER_GRID_SIZE = 84

type MapPoint = { id?: number; latitude: number; longitude: number; count: number; name?: string }
type SelectedToilet = { id: number; name: string; latitude: number; longitude: number }
type CardPosition = { left: number; top: number }

const PLACE_CARD_WIDTH = 360
const MAP_EDGE_GAP = 18

type CountItem = { label: string; count: number }

function visibleCounts(items: CountItem[]) {
  return items.filter(({ count }) => count > 0)
}

function hasValue(value: string) {
  return value.trim().length > 0
}

function formatOpenTime(toilet: ToiletDetailResponse) {
  return [toilet.openTime, toilet.openTimeDetail].filter(hasValue).join(' · ') || '운영시간 정보 없음'
}

function formatPhoneNumber(phoneNumber: string) {
  const digits = phoneNumber.replace(/\D/g, '')
  if (/^02\d{7,8}$/.test(digits)) return digits.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3')
  if (/^0\d{9,10}$/.test(digits)) return digits.replace(/^(0\d{2})(\d{3,4})(\d{4})$/, '$1-$2-$3')
  return phoneNumber
}

function groupPointsByScreenGrid(map: KakaoMapInstance, points: MapPoint[]) {
  const groups = new Map<string, { id?: number; latitude: number; longitude: number; count: number; name?: string }>()
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
      groups.set(key, { id: point.id, latitude: point.latitude * point.count, longitude: point.longitude * point.count, count: point.count, name: point.name })
    }
  }

  return [...groups.values()].map((group) => ({
    latitude: group.latitude / group.count,
    longitude: group.longitude / group.count,
    count: group.count,
    id: group.count === 1 ? group.id : undefined,
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
  const detailRequestRef = useRef(0)
  const placeCardRef = useRef<HTMLElement>(null)
  const locationMessageTimerRef = useRef<number | undefined>(undefined)
  const cardTouchStartYRef = useRef<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ToiletMapSearchResponse | null>(null)
  const [selectedToilet, setSelectedToilet] = useState<SelectedToilet | null>(null)
  const [placeCardPosition, setPlaceCardPosition] = useState<CardPosition | null>(null)
  const [toiletDetail, setToiletDetail] = useState<ToiletDetailResponse | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [locationMessage, setLocationMessage] = useState<string | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [isMobileCardExpanded, setIsMobileCardExpanded] = useState(false)

  const showLocationMessage = useCallback((message: string) => {
    window.clearTimeout(locationMessageTimerRef.current)
    setLocationMessage(message)
    locationMessageTimerRef.current = window.setTimeout(() => setLocationMessage(null), 4_000)
  }, [])

  const clearOverlays = useCallback(() => {
    overlaysRef.current.forEach((overlay) => overlay.setMap(null))
    overlaysRef.current = []
  }, [])

  const positionPlaceCardAtToilet = useCallback((toilet: SelectedToilet, cardHeight: number) => {
    const container = mapContainerRef.current
    const map = mapRef.current
    if (!container || !map) return

    const point = map.getProjection().pointFromCoords(new window.kakao.maps.LatLng(toilet.latitude, toilet.longitude))
    let left = point.x - (PLACE_CARD_WIDTH / 2)
    let top = point.y - cardHeight - MAP_EDGE_GAP
    if (left < MAP_EDGE_GAP) left = point.x + MAP_EDGE_GAP
    if (left + PLACE_CARD_WIDTH > container.clientWidth - MAP_EDGE_GAP) left = point.x - PLACE_CARD_WIDTH - MAP_EDGE_GAP
    if (top < MAP_EDGE_GAP) top = point.y + MAP_EDGE_GAP
    setPlaceCardPosition((current) => current && Math.abs(current.left - left) < 1 && Math.abs(current.top - top) < 1 ? current : { left, top })
  }, [])

  useLayoutEffect(() => {
    if (!selectedToilet || !placeCardRef.current) return
    positionPlaceCardAtToilet(selectedToilet, placeCardRef.current.offsetHeight)
  }, [selectedToilet, toiletDetail, isDetailLoading, detailError, positionPlaceCardAtToilet])

  const positionSelectedCard = useCallback(() => {
    if (selectedToiletRef.current && placeCardRef.current) {
      positionPlaceCardAtToilet(selectedToiletRef.current, placeCardRef.current.offsetHeight)
    }
  }, [positionPlaceCardAtToilet])

  const selectToilet = useCallback(async (toiletId: number, name: string, latitude: number, longitude: number) => {
    const requestSequence = ++detailRequestRef.current
    const selected = { id: toiletId, name, latitude, longitude }
    selectedToiletRef.current = selected
    setSelectedToilet(selected)
    setPlaceCardPosition(null)
    setIsMobileCardExpanded(false)
    setToiletDetail(null)
    setDetailError(null)
    setIsDetailLoading(true)

    try {
      const detail = await fetchToiletDetail(toiletId)
      if (requestSequence === detailRequestRef.current) setToiletDetail(detail)
    } catch {
      if (requestSequence === detailRequestRef.current) {
        setDetailError('상세 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
      }
    } finally {
      if (requestSequence === detailRequestRef.current) setIsDetailLoading(false)
    }
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
        if (point.id != null) void selectToilet(point.id, toiletName, point.latitude, point.longitude)
      })

      return new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(point.latitude, point.longitude),
        content,
        yAnchor: 1,
        zIndex: 1,
      })
    })

    overlaysRef.current.forEach((overlay) => overlay.setMap(map))
  }, [clearOverlays, selectToilet])

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
      if (!isInitialRequest) showLocationMessage('이 브라우저에서는 현재 위치를 지원하지 않습니다.')
      setIsLocating(false)
      return
    }

    if (!isInitialRequest) setIsLocating(true)
    try {
      if ('permissions' in navigator) {
        const permission = await navigator.permissions.query({ name: 'geolocation' })
        if (permission.state === 'denied') {
          if (!isInitialRequest) showLocationMessage('위치 권한이 거부되었습니다. 브라우저의 사이트 설정에서 위치를 허용해 주세요.')
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
        window.clearTimeout(locationMessageTimerRef.current)
        setLocationMessage(null)
        setIsLocating(false)
      },
      (positionError) => {
        const messageByCode: Record<number, string> = {
          1: '위치 권한이 거부되었습니다. 브라우저 주소창의 위치 권한을 허용한 뒤 다시 시도해 주세요.',
          2: '현재 위치를 확인할 수 없습니다. GPS·Wi‑Fi 연결을 확인해 주세요.',
          3: '위치 확인 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
        }
        if (!isInitialRequest) showLocationMessage(messageByCode[positionError.code] ?? '현재 위치를 확인하지 못했습니다.')
        setIsLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    )
  }, [showLocationMessage])

  useEffect(() => {
    let disposed = false
    let resizeObserver: ResizeObserver | undefined

    async function initialize() {
      if (!mapContainerRef.current) return

      try {
        const map = await createKakaoMap(mapContainerRef.current, DAEJEON_CITY_HALL)
        if (disposed) return
        mapRef.current = map
        window.kakao.maps.event.addListener(map, 'idle', () => {
          loadMapArea()
          positionSelectedCard()
        })
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
      window.clearTimeout(locationMessageTimerRef.current)
    }
  }, [clearOverlays, loadMapArea, moveToCurrentLocation, positionSelectedCard])

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="급똥 지도 홈">급똥</a>
        <span className="subtitle">내 주변 공중화장실 찾기</span>
      </header>

      <section className="map-section" aria-label="공중화장실 지도">
        <div ref={mapContainerRef} className="map" />
        <div className={`map-controls${selectedToilet ? ' is-with-card' : ''}`}>
          <div className="map-hud" aria-live="polite">
            {isLoading && <span>지도를 조회하는 중…</span>}
            {!isLoading && result && <span>이 지역 {result.meta.total_count.toLocaleString()}곳{result.meta.display_type === 'CLUSTER' ? ' · 묶어서 표시 중' : ''}</span>}
            {error && <span className="error-message">{error}</span>}
          </div>
          <button className={`location-button${selectedToilet ? ' is-with-card' : ''}`} type="button" onClick={() => void moveToCurrentLocation()} disabled={isLocating}>
            {isLocating ? '확인 중' : '현재 위치'}
          </button>
        </div>
        {locationMessage && <p className="location-message" role="status">{locationMessage}</p>}
        {selectedToilet && (
          <aside
            ref={placeCardRef}
            className={`place-card${isMobileCardExpanded ? ' mobile-card-expanded' : ''}`}
            aria-live="polite"
            style={placeCardPosition ? { left: placeCardPosition.left, top: placeCardPosition.top } : undefined}
            onTouchStart={(event) => { cardTouchStartYRef.current = event.touches[0]?.clientY ?? null }}
            onTouchEnd={(event) => {
              const startY = cardTouchStartYRef.current
              const endY = event.changedTouches[0]?.clientY
              cardTouchStartYRef.current = null
              if (startY != null && endY != null && startY - endY > 36) setIsMobileCardExpanded(true)
            }}
          >
            <button type="button" className="close-button" onClick={() => { detailRequestRef.current += 1; selectedToiletRef.current = null; setSelectedToilet(null); setPlaceCardPosition(null); setToiletDetail(null); setIsMobileCardExpanded(false) }} aria-label="정보 닫기">×</button>
            <button type="button" className="mobile-card-handle" onClick={() => setIsMobileCardExpanded((expanded) => !expanded)} aria-expanded={isMobileCardExpanded}>
              {isMobileCardExpanded ? '상세 정보 접기' : '상세 정보 보기'}
            </button>
            <div className="place-card-summary">
              <span className="card-label">{toiletDetail?.toiletType || '공중화장실'}</span>
              <strong>{toiletDetail?.name || selectedToilet.name}</strong>
              <p className="open-time">{toiletDetail ? formatOpenTime(toiletDetail) : isDetailLoading ? '상세 정보를 불러오는 중…' : '상세 정보를 확인해 주세요.'}</p>
              {toiletDetail && hasValue(toiletDetail.roadAddress || toiletDetail.jibunAddress) && <div className="summary-address"><DetailRow label="주소" value={toiletDetail.roadAddress || toiletDetail.jibunAddress} copyable /></div>}
            </div>
            {detailError && <p className="detail-error" role="alert">{detailError}</p>}
            {toiletDetail && <ToiletDetailContents toilet={toiletDetail} />}
          </aside>
        )}
      </section>
      <footer>지도 이동 또는 확대/축소 후 이 영역의 화장실을 다시 조회합니다.</footer>
    </main>
  )
}

function ToiletDetailContents({ toilet }: { toilet: ToiletDetailResponse }) {
  const maleCounts = visibleCounts([
    { label: '대변기', count: toilet.maleToiletCount },
    { label: '소변기', count: toilet.maleUrinalCount },
    { label: '장애인 대변기', count: toilet.maleDisabledToiletCount },
    { label: '장애인 소변기', count: toilet.maleDisabledUrinalCount },
    { label: '어린이 대변기', count: toilet.maleChildToiletCount },
    { label: '어린이 소변기', count: toilet.maleChildUrinalCount },
  ])
  const femaleCounts = visibleCounts([
    { label: '대변기', count: toilet.femaleToiletCount },
    { label: '장애인 대변기', count: toilet.femaleDisabledToiletCount },
    { label: '어린이 대변기', count: toilet.femaleChildToiletCount },
  ])
  const address = toilet.roadAddress || toilet.jibunAddress

  return (
    <div className="card-details" tabIndex={0} aria-label="화장실 상세 정보">
      {address && <DetailRow className="detail-address" label="주소" value={address} copyable />}
      {hasValue(toilet.openTimeDetail) && <DetailRow label="개방시간 상세" value={toilet.openTimeDetail} />}
      {hasValue(toilet.installationDate) && <DetailRow label="설치연월" value={toilet.installationDate} />}
      {(maleCounts.length > 0 || femaleCounts.length > 0) && <section className="detail-section">
        <h2>화장실 수</h2>
        <div className="capacity-groups">
          {maleCounts.length > 0 && <CapacityGroup title="남성" items={maleCounts} />}
          {femaleCounts.length > 0 && <CapacityGroup title="여성" items={femaleCounts} />}
        </div>
      </section>}
      <section className="detail-section facility-section">
        <h2>편의·안전</h2>
        <FacilityRow label="비상벨" available={toilet.hasEmergencyBell === 'Y'} location={toilet.emergencyBellLocation} />
        <FacilityRow label="CCTV" available={toilet.hasCctv === 'Y'} />
        <FacilityRow label="기저귀 교환대" available={toilet.hasDiaperTable === 'Y'} location={toilet.diaperTableLocation} />
      </section>
      {hasValue(toilet.agencyName) && <DetailRow label="관리기관" value={toilet.agencyName} />}
      {hasValue(toilet.phoneNumber) && <DetailRow label="전화" value={formatPhoneNumber(toilet.phoneNumber)} />}
      {hasValue(toilet.dataBaseDate) && <DetailRow label="데이터 기준일" value={toilet.dataBaseDate} />}
    </div>
  )
}

function CapacityGroup({ title, items }: { title: string; items: CountItem[] }) {
  return <div className="capacity-group"><h3>{title}</h3><dl>{items.map(({ label, count }) => <div key={label}><dt>{label}</dt><dd>{count}대</dd></div>)}</dl></div>
}

function FacilityRow({ label, available, location }: { label: string; available: boolean; location?: string }) {
  if (!available) {
    return <div className="facility-row"><strong>{label}</strong><span className="facility-status is-unavailable">미설치</span><span className="facility-location-placeholder" aria-hidden="true" /></div>
  }

  return <details className="facility-row facility-row-expandable">
    <summary><strong>{label}</strong><span className="facility-status">설치됨</span><span className="facility-location-label">위치 보기 <span aria-hidden="true">⌄</span></span></summary>
    <p>{hasValue(location ?? '') ? `위치: ${location}` : '위치 정보가 등록되지 않았습니다.'}</p>
  </details>
}

function DetailRow({ label, value, copyable = false, className = '' }: { label: string; value: string; copyable?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false)

  const copyValue = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.append(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setCopied(false)
    }
  }

  return <div className={`detail-row ${className}`.trim()}><dt>{label}</dt><dd><span>{value}</span>{copyable && <button type="button" className="copy-address-button" onClick={() => void copyValue()}>{copied ? '복사됨' : '주소 복사'}</button>}</dd></div>
}

export default App
