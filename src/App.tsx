import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { fetchToiletDetail, fetchToiletsInBounds, type ToiletDetailResponse, type ToiletMapSearchResponse } from './api/toilets'
import { createKakaoMap, searchKakaoPlaces, type KakaoMapInstance, type KakaoOverlay, type KakaoPlace } from './lib/kakaoMap'
import toiletMarkerLogo from './assets/toilet-marker-logo.svg'
import './App.css'

const DAEJEON_CITY_HALL = { latitude: 36.3504, longitude: 127.3845 }
const CLUSTER_GRID_SIZE = 84

type ToiletMapItem = { id: number; name: string; latitude: number; longitude: number }
type MapPoint = { id?: number; latitude: number; longitude: number; count: number; name?: string; toilets?: ToiletMapItem[] }
type SelectedToilet = { id: number; name: string; latitude: number; longitude: number }
type SelectedCoordinateGroup = { latitude: number; longitude: number; toilets: ToiletMapItem[] }
type CardPosition = { left: number; top: number }
type Coordinates = { latitude: number; longitude: number }

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

function formatInstallationDate(installationDate: string) {
  const digits = installationDate.replace(/\D/g, '')
  const matched = digits.match(/^(\d{4})(\d{1,2})$/)
  if (!matched) return installationDate

  const month = Number(matched[2])
  if (month < 1 || month > 12) return `${matched[1]}년`
  return `${matched[1]}년 ${month}월`
}

function formatFacilityLocation(location: string) {
  return location.replace(/\s*\+\s*/g, ' / ')
}

function calculateDistanceInMeters(from: Coordinates, to: Coordinates) {
  const earthRadiusInMeters = 6_371_000
  const toRadians = (degree: number) => degree * (Math.PI / 180)
  const latitudeDelta = toRadians(to.latitude - from.latitude)
  const longitudeDelta = toRadians(to.longitude - from.longitude)
  const latitudeFrom = toRadians(from.latitude)
  const latitudeTo = toRadians(to.latitude)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeFrom) * Math.cos(latitudeTo) * Math.sin(longitudeDelta / 2) ** 2

  return 2 * earthRadiusInMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function formatDistance(distanceInMeters: number) {
  if (distanceInMeters < 1_000) return `${Math.round(distanceInMeters / 10) * 10}m`
  return `${(distanceInMeters / 1_000).toFixed(1)}km`
}

function groupToiletsByCoordinate(toilets: ToiletMapItem[]) {
  const groups = new Map<string, ToiletMapItem[]>()

  for (const toilet of toilets) {
    const key = `${toilet.latitude}:${toilet.longitude}`
    const current = groups.get(key)
    if (current) current.push(toilet)
    else groups.set(key, [toilet])
  }

  return [...groups.values()].map((items): MapPoint => {
    const [toilet] = items
    return items.length === 1
      ? { ...toilet, count: 1 }
      : { latitude: toilet.latitude, longitude: toilet.longitude, count: items.length, toilets: items }
  })
}

function coordinateGroupFloor(name: string) {
  const basement = name.match(/(?:지하|b)\s*(\d+)\s*층/i)
  if (basement) return -Number(basement[1])

  const floor = name.match(/(\d+)\s*층/)
  return floor ? Number(floor[1]) : null
}

function sortCoordinateGroupToilets(toilets: ToiletMapItem[]) {
  const collator = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' })

  return [...toilets].sort((left, right) => {
    const leftFloor = coordinateGroupFloor(left.name)
    const rightFloor = coordinateGroupFloor(right.name)
    if (leftFloor != null && rightFloor != null && leftFloor !== rightFloor) return rightFloor - leftFloor
    if (leftFloor != null && rightFloor == null) return -1
    if (leftFloor == null && rightFloor != null) return 1
    return collator.compare(right.name, left.name)
  })
}

function groupPointsByScreenGrid(map: KakaoMapInstance, points: MapPoint[]) {
  const groups = new Map<string, MapPoint[]>()
  const projection = map.getProjection()

  for (const point of points) {
    const projected = projection.pointFromCoords(new window.kakao.maps.LatLng(point.latitude, point.longitude))
    const key = `${Math.floor(projected.x / CLUSTER_GRID_SIZE)}:${Math.floor(projected.y / CLUSTER_GRID_SIZE)}`
    const current = groups.get(key)
    if (current) current.push(point)
    else groups.set(key, [point])
  }

  return [...groups.values()].map((items): MapPoint => {
    if (items.length === 1) return items[0]

    const count = items.reduce((total, point) => total + point.count, 0)
    return {
      latitude: items.reduce((total, point) => total + (point.latitude * point.count), 0) / count,
      longitude: items.reduce((total, point) => total + (point.longitude * point.count), 0) / count,
      count,
    }
  })
}

function App() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMapInstance | null>(null)
  const overlaysRef = useRef<KakaoOverlay[]>([])
  const toiletMarkerElementsRef = useRef(new Map<number, HTMLButtonElement>())
  const currentLocationOverlayRef = useRef<KakaoOverlay | null>(null)
  const searchLocationOverlayRef = useRef<KakaoOverlay | null>(null)
  const locationWatchIdRef = useRef<number | null>(null)
  const requestSequenceRef = useRef(0)
  const mapInteractionRef = useRef(false)
  const selectedToiletRef = useRef<SelectedToilet | null>(null)
  const detailRequestRef = useRef(0)
  const coordinateGroupListRef = useRef<HTMLDivElement>(null)
  const coordinateGroupItemRefs = useRef(new Map<number, HTMLDivElement>())
  const placeCardRef = useRef<HTMLElement>(null)
  const locationMessageTimerRef = useRef<number | undefined>(undefined)
  const cardTouchStartYRef = useRef<number | null>(null)
  const placeSearchRequestRef = useRef(0)
  const placeSearchInputRef = useRef<HTMLInputElement>(null)
  const mapLoadTimerRef = useRef<number | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ToiletMapSearchResponse | null>(null)
  const [selectedToilet, setSelectedToilet] = useState<SelectedToilet | null>(null)
  const [selectedCoordinateGroup, setSelectedCoordinateGroup] = useState<SelectedCoordinateGroup | null>(null)
  const [expandedCoordinateToilet, setExpandedCoordinateToilet] = useState<SelectedToilet | null>(null)
  const [placeCardPosition, setPlaceCardPosition] = useState<CardPosition | null>(null)
  const [toiletDetail, setToiletDetail] = useState<ToiletDetailResponse | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [locationMessage, setLocationMessage] = useState<string | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [isMobileCardExpanded, setIsMobileCardExpanded] = useState(false)
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null)
  const [placeSearchKeyword, setPlaceSearchKeyword] = useState('')
  const [placeSearchResults, setPlaceSearchResults] = useState<KakaoPlace[]>([])
  const [placeSearchMessage, setPlaceSearchMessage] = useState<string | null>(null)
  const [isPlaceSearching, setIsPlaceSearching] = useState(false)
  const [activePlaceSearchIndex, setActivePlaceSearchIndex] = useState(-1)
  const [isPlaceSearchFocused, setIsPlaceSearchFocused] = useState(false)

  const showLocationMessage = useCallback((message: string) => {
    window.clearTimeout(locationMessageTimerRef.current)
    setLocationMessage(message)
    locationMessageTimerRef.current = window.setTimeout(() => setLocationMessage(null), 4_000)
  }, [])

  const clearOverlays = useCallback(() => {
    overlaysRef.current.forEach((overlay) => overlay.setMap(null))
    overlaysRef.current = []
    toiletMarkerElementsRef.current.clear()
  }, [])

  const positionPlaceCardAtToilet = useCallback((toilet: SelectedToilet, cardHeight: number) => {
    const container = mapContainerRef.current
    const map = mapRef.current
    if (!container || !map) return

    const marker = toiletMarkerElementsRef.current.get(toilet.id)
    const markerRect = marker?.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const point = markerRect && marker?.isConnected
      ? {
          x: markerRect.left - containerRect.left + (markerRect.width / 2),
          y: markerRect.top - containerRect.top + markerRect.height,
        }
      : map.getProjection().pointFromCoords(new window.kakao.maps.LatLng(toilet.latitude, toilet.longitude))
    const cardWidth = Math.min(PLACE_CARD_WIDTH, container.clientWidth - (MAP_EDGE_GAP * 2))
    let left = point.x - (cardWidth / 2)
    let top = point.y - cardHeight - MAP_EDGE_GAP
    if (left < MAP_EDGE_GAP) left = point.x + MAP_EDGE_GAP
    if (left + cardWidth > container.clientWidth - MAP_EDGE_GAP) left = point.x - cardWidth - MAP_EDGE_GAP
    if (top < MAP_EDGE_GAP) top = point.y + MAP_EDGE_GAP
    if (top + cardHeight > container.clientHeight - MAP_EDGE_GAP) top = container.clientHeight - cardHeight - MAP_EDGE_GAP
    setPlaceCardPosition((current) => current && Math.abs(current.left - left) < 1 && Math.abs(current.top - top) < 1 ? current : { left, top })
  }, [])

  const closeDetailCard = useCallback(() => {
    detailRequestRef.current += 1
    selectedToiletRef.current = null
    setSelectedToilet(null)
    setSelectedCoordinateGroup(null)
    setExpandedCoordinateToilet(null)
    setPlaceCardPosition(null)
    setToiletDetail(null)
    setDetailError(null)
    setIsDetailLoading(false)
    setIsMobileCardExpanded(false)
    toiletMarkerElementsRef.current.forEach((marker) => marker.classList.remove('is-selected'))
  }, [])

  useEffect(() => {
    const keyword = placeSearchKeyword.trim()
    const requestSequence = ++placeSearchRequestRef.current

    if (keyword.length < 2) {
      return
    }

    const timer = window.setTimeout(async () => {
      setIsPlaceSearching(true)
      setPlaceSearchMessage(null)
      try {
        const places = await searchKakaoPlaces(keyword)
        if (requestSequence !== placeSearchRequestRef.current) return
        setPlaceSearchResults(places)
        setPlaceSearchMessage(places.length === 0 ? '검색 결과가 없습니다.' : null)
      } catch {
        if (requestSequence === placeSearchRequestRef.current) {
          setPlaceSearchResults([])
          setPlaceSearchMessage('장소를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.')
        }
      } finally {
        if (requestSequence === placeSearchRequestRef.current) setIsPlaceSearching(false)
      }
    }, 300)

    return () => window.clearTimeout(timer)
  }, [placeSearchKeyword])

  useLayoutEffect(() => {
    if (!selectedToilet || !placeCardRef.current) return
    const frame = window.requestAnimationFrame(() => {
      if (placeCardRef.current) positionPlaceCardAtToilet(selectedToilet, placeCardRef.current.offsetHeight)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [selectedToilet, toiletDetail, isDetailLoading, detailError, positionPlaceCardAtToilet])

  const positionSelectedCard = useCallback(() => {
    if (selectedToiletRef.current && placeCardRef.current) {
      positionPlaceCardAtToilet(selectedToiletRef.current, placeCardRef.current.offsetHeight)
    }
  }, [positionPlaceCardAtToilet])

  const selectToilet = useCallback(async (toiletId: number, name: string, latitude: number, longitude: number, keepCoordinateGroup = false) => {
    const requestSequence = ++detailRequestRef.current
    const selected = { id: toiletId, name, latitude, longitude }
    selectedToiletRef.current = selected
    setExpandedCoordinateToilet(null)
    if (!keepCoordinateGroup || !window.matchMedia('(min-width: 641px)').matches) setSelectedCoordinateGroup(null)
    toiletMarkerElementsRef.current.forEach((marker, markerId) => marker.classList.toggle('is-selected', markerId === toiletId))
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

  const openCoordinateGroup = useCallback((point: MapPoint) => {
    if (!point.toilets) return
    closeDetailCard()
    setSelectedCoordinateGroup({ latitude: point.latitude, longitude: point.longitude, toilets: sortCoordinateGroupToilets(point.toilets) })
  }, [closeDetailCard])

  const toggleCoordinateToiletDetail = useCallback(async (toilet: ToiletMapItem) => {
    if (expandedCoordinateToilet?.id === toilet.id) {
      detailRequestRef.current += 1
      setExpandedCoordinateToilet(null)
      setToiletDetail(null)
      setDetailError(null)
      setIsDetailLoading(false)
      return
    }

    const requestSequence = ++detailRequestRef.current
    selectedToiletRef.current = null
    setSelectedToilet(null)
    setPlaceCardPosition(null)
    setExpandedCoordinateToilet(toilet)
    setToiletDetail(null)
    setDetailError(null)
    setIsDetailLoading(true)

    const scrollExpandedItemIntoView = () => {
      const list = coordinateGroupListRef.current
      const item = coordinateGroupItemRefs.current.get(toilet.id)
      if (!list || !item) return

      const itemTop = item.offsetTop - list.offsetTop
      list.scrollTo({ top: Math.max(0, itemTop - 8), behavior: 'smooth' })
    }

    requestAnimationFrame(scrollExpandedItemIntoView)

    try {
      const detail = await fetchToiletDetail(toilet.id)
      if (requestSequence === detailRequestRef.current) setToiletDetail(detail)
    } catch {
      if (requestSequence === detailRequestRef.current) setDetailError('상세 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      if (requestSequence === detailRequestRef.current) {
        setIsDetailLoading(false)
        requestAnimationFrame(scrollExpandedItemIntoView)
      }
    }
  }, [expandedCoordinateToilet])

  const renderResult = useCallback((map: KakaoMapInstance, response: ToiletMapSearchResponse) => {
    clearOverlays()

    const points: MapPoint[] = response.meta.display_type === 'CLUSTER'
      ? response.clusters
      : groupToiletsByCoordinate(response.toilets)
    const displayPoints = map.getLevel() >= 5 || response.meta.display_type === 'CLUSTER'
      ? groupPointsByScreenGrid(map, points)
      : points

    const shouldShowToiletName = map.getLevel() <= 4 && response.meta.display_type !== 'CLUSTER'

    overlaysRef.current = displayPoints.map((point) => {
      if (point.count > 1) {
        const content = document.createElement('button')
        const isCoordinateGroup = point.toilets != null
        content.className = isCoordinateGroup ? 'coordinate-group-marker' : 'cluster-marker'
        content.type = 'button'
        content.textContent = isCoordinateGroup ? `동일 위치 ${point.count}` : String(point.count)
        content.setAttribute('aria-label', isCoordinateGroup ? `동일 위치에 등록된 화장실 ${point.count}곳 목록 보기` : `${point.count}개의 화장실이 있는 구역 확대하기`)
        content.addEventListener('click', () => {
          if (isCoordinateGroup) {
            openCoordinateGroup(point)
            return
          }
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
      const toiletName = point.name ?? '공중화장실'
      const pin = document.createElement('span')
      pin.className = 'toilet-marker-pin'
      pin.setAttribute('aria-hidden', 'true')
      const logo = document.createElement('img')
      logo.className = 'toilet-marker-logo'
      logo.src = toiletMarkerLogo
      logo.alt = ''
      pin.append(logo)
      content.append(pin)
      if (shouldShowToiletName) {
        const name = document.createElement('span')
        name.className = 'toilet-marker-name'
        name.textContent = toiletName
        content.append(name)
      }
      content.setAttribute('aria-label', toiletName)
      if (point.id != null) {
        toiletMarkerElementsRef.current.set(point.id, content)
        content.classList.toggle('is-selected', selectedToiletRef.current?.id === point.id)
      }
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
  }, [clearOverlays, openCoordinateGroup, selectToilet])

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

  const scheduleMapAreaLoad = useCallback(() => {
    window.clearTimeout(mapLoadTimerRef.current)
    mapLoadTimerRef.current = window.setTimeout(() => {
      void loadMapArea()
    }, 180)
  }, [loadMapArea])

  const updateCurrentLocation = useCallback((coordinates: Coordinates, shouldCenterMap: boolean) => {
    const map = mapRef.current
    if (!map) return

    setCurrentLocation(coordinates)
    const position = new window.kakao.maps.LatLng(coordinates.latitude, coordinates.longitude)
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

    if (shouldCenterMap) {
      map.setLevel(Math.min(map.getLevel(), 4))
      map.panTo(position)
    }
  }, [])

  const startCurrentLocationWatch = useCallback(() => {
    if (!navigator.geolocation || locationWatchIdRef.current != null) return

    locationWatchIdRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => updateCurrentLocation({ latitude: coords.latitude, longitude: coords.longitude }, false),
      () => {
        // 최초 위치 확인은 버튼 요청에서 안내한다. 이후 갱신 실패는 사용자 흐름을 방해하지 않는다.
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    )
  }, [updateCurrentLocation])

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
        updateCurrentLocation({ latitude: coords.latitude, longitude: coords.longitude }, true)
        startCurrentLocationWatch()
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
  }, [showLocationMessage, startCurrentLocationWatch, updateCurrentLocation])

  const moveToSearchPlace = useCallback((place: KakaoPlace) => {
    const map = mapRef.current
    if (!map) return

    closeDetailCard()
    const position = new window.kakao.maps.LatLng(place.latitude, place.longitude)
    searchLocationOverlayRef.current?.setMap(null)
    const content = document.createElement('div')
    content.className = 'search-place-marker'
    const icon = document.createElement('span')
    icon.setAttribute('aria-hidden', 'true')
    icon.textContent = '⌖'
    const label = document.createElement('span')
    label.textContent = place.name
    content.append(icon, label)
    searchLocationOverlayRef.current = new window.kakao.maps.CustomOverlay({
      position,
      content,
      yAnchor: 1,
      zIndex: 4,
    })
    searchLocationOverlayRef.current.setMap(map)
    map.setLevel(4)
    map.panTo(position)
    setPlaceSearchKeyword(place.name)
    setPlaceSearchResults([])
    setPlaceSearchMessage(null)
    setActivePlaceSearchIndex(-1)
    setIsPlaceSearching(false)
    setIsPlaceSearchFocused(false)
    placeSearchInputRef.current?.blur()
  }, [closeDetailCard])

  const handlePlaceSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && placeSearchResults.length > 0) {
      event.preventDefault()
      setActivePlaceSearchIndex((index) => Math.min(index + 1, placeSearchResults.length - 1))
      return
    }
    if (event.key === 'ArrowUp' && placeSearchResults.length > 0) {
      event.preventDefault()
      setActivePlaceSearchIndex((index) => Math.max(index - 1, 0))
      return
    }
    if (event.key === 'Enter' && activePlaceSearchIndex >= 0) {
      event.preventDefault()
      moveToSearchPlace(placeSearchResults[activePlaceSearchIndex])
      return
    }
    if (event.key === 'Escape') {
      setPlaceSearchResults([])
      setPlaceSearchMessage(null)
      setActivePlaceSearchIndex(-1)
      setIsPlaceSearchFocused(false)
      event.currentTarget.blur()
    }
  }

  const handlePlaceSearchChange = (keyword: string) => {
    setPlaceSearchKeyword(keyword)
    setActivePlaceSearchIndex(-1)
    setPlaceSearchResults([])
    setPlaceSearchMessage(null)
    setIsPlaceSearching(false)
  }

  const handlePlaceSearchFocus = () => {
    placeSearchRequestRef.current += 1
    setPlaceSearchKeyword('')
    setPlaceSearchResults([])
    setPlaceSearchMessage(null)
    setIsPlaceSearching(false)
    setActivePlaceSearchIndex(-1)
    setIsPlaceSearchFocused(true)
  }

  const isPlaceSearchResultsOpen = isPlaceSearchFocused && placeSearchKeyword.trim().length >= 2

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
          if (mapInteractionRef.current) {
            mapInteractionRef.current = false
            if (window.matchMedia('(min-width: 641px)').matches) closeDetailCard()
          }
          scheduleMapAreaLoad()
          positionSelectedCard()
        })
        const markMapInteraction = () => { mapInteractionRef.current = true }
        window.kakao.maps.event.addListener(map, 'dragstart', markMapInteraction)
        window.kakao.maps.event.addListener(map, 'zoom_changed', markMapInteraction)
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
      searchLocationOverlayRef.current?.setMap(null)
      if (locationWatchIdRef.current != null) {
        navigator.geolocation?.clearWatch(locationWatchIdRef.current)
        locationWatchIdRef.current = null
      }
      resizeObserver?.disconnect()
      window.clearTimeout(mapLoadTimerRef.current)
      window.clearTimeout(locationMessageTimerRef.current)
    }
  }, [clearOverlays, closeDetailCard, loadMapArea, moveToCurrentLocation, positionSelectedCard, scheduleMapAreaLoad])

  const distanceToSelectedToilet = currentLocation && selectedToilet
    ? formatDistance(calculateDistanceInMeters(currentLocation, selectedToilet))
    : null
  const distanceToCoordinateGroup = currentLocation && selectedCoordinateGroup
    ? formatDistance(calculateDistanceInMeters(currentLocation, selectedCoordinateGroup))
    : null
  const hasMapCard = selectedToilet != null || selectedCoordinateGroup != null

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="급똥 지도 홈">급똥</a>
        <span className="subtitle">내 주변 공중화장실 찾기</span>
        <div className="place-search">
          <label className="sr-only" htmlFor="place-search-input">주소 또는 장소 검색</label>
          <input
            ref={placeSearchInputRef}
            id="place-search-input"
            className="place-search-input"
            type="search"
            value={placeSearchKeyword}
            placeholder="주소 또는 장소 검색"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={isPlaceSearchResultsOpen}
            aria-controls="place-search-results"
            aria-activedescendant={activePlaceSearchIndex >= 0 ? `place-search-result-${placeSearchResults[activePlaceSearchIndex]?.id}` : undefined}
            onChange={(event) => handlePlaceSearchChange(event.target.value)}
            onKeyDown={handlePlaceSearchKeyDown}
            onFocus={handlePlaceSearchFocus}
            onBlur={() => setIsPlaceSearchFocused(false)}
          />
          {isPlaceSearchResultsOpen && <div id="place-search-results" className="place-search-results" role="listbox" aria-label="장소 검색 결과">
            {isPlaceSearching && <p className="place-search-status">검색 중…</p>}
            {!isPlaceSearching && placeSearchMessage && <p className="place-search-status">{placeSearchMessage}</p>}
            {!isPlaceSearching && placeSearchResults.map((place, index) => <button
              id={`place-search-result-${place.id}`}
              key={place.id}
              type="button"
              role="option"
              aria-selected={activePlaceSearchIndex === index}
              className={activePlaceSearchIndex === index ? 'is-active' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => moveToSearchPlace(place)}
            ><strong>{place.name}</strong><span>{place.address || '주소 정보 없음'}</span></button>)}
          </div>}
        </div>
      </header>

      <section className="map-section" aria-label="공중화장실 지도">
        <div ref={mapContainerRef} className="map" />
        <div className={`map-controls${hasMapCard ? ' is-with-card' : ''}`}>
          <div className="map-hud" aria-live="polite">
            {isLoading && <span>지도를 조회하는 중…</span>}
            {!isLoading && result && <span>이 지역 {result.meta.total_count.toLocaleString()}곳{result.meta.display_type === 'CLUSTER' ? ' · 묶어서 표시 중' : ''}</span>}
            {error && <span className="error-message">{error}</span>}
          </div>
          <button className={`location-button${hasMapCard ? ' is-with-card' : ''}`} type="button" onClick={() => void moveToCurrentLocation()} disabled={isLocating}>
            {isLocating ? '확인 중' : '현재 위치'}
          </button>
        </div>
        {locationMessage && <p className="location-message" role="status">{locationMessage}</p>}
        {selectedToilet && (
          <aside
            ref={placeCardRef}
            className={`place-card${isMobileCardExpanded ? ' mobile-card-expanded' : ''}${selectedCoordinateGroup ? ' place-card-with-group' : ''}`}
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
            <button type="button" className="close-button" onClick={closeDetailCard} aria-label="정보 닫기">×</button>
            <button type="button" className="mobile-card-handle" onClick={() => setIsMobileCardExpanded((expanded) => !expanded)} aria-expanded={isMobileCardExpanded}>
              {isMobileCardExpanded ? '상세 정보 접기' : '상세 정보 보기'}
            </button>
            <div className="place-card-summary">
              <span className="card-label">{toiletDetail?.toiletType || '공중화장실'}</span>
              <strong>{toiletDetail?.name || selectedToilet.name}</strong>
            </div>
            <div className="card-scroll-content">
              <p className="open-time">{toiletDetail ? formatOpenTime(toiletDetail) : isDetailLoading ? '상세 정보를 불러오는 중…' : '상세 정보를 확인해 주세요.'}</p>
              {distanceToSelectedToilet && <div className="distance-from-current"><span className="distance-label">내 위치에서 약</span><strong className="distance-value">{distanceToSelectedToilet}</strong><span className="distance-caption">(직선거리)</span></div>}
              {toiletDetail && hasValue(toiletDetail.roadAddress || toiletDetail.jibunAddress) && <div className="summary-address"><DetailRow label="주소" value={toiletDetail.roadAddress || toiletDetail.jibunAddress} copyable /></div>}
              {detailError && <p className="detail-error" role="alert">{detailError}</p>}
              {toiletDetail && <ToiletDetailContents toilet={toiletDetail} />}
            </div>
          </aside>
        )}
        {selectedCoordinateGroup && (
          <aside className="coordinate-group-card" aria-live="polite" aria-label="같은 위치 화장실 목록">
            <button type="button" className="close-button" onClick={closeDetailCard} aria-label="목록 닫기">×</button>
            <span className="card-label">동일 좌표로 등록됨</span>
            {distanceToCoordinateGroup && <p className="coordinate-group-distance">내 위치에서 약 <strong>{distanceToCoordinateGroup}</strong></p>}
            <p>화장실을 선택하면 해당 행 아래에서 상세 정보가 펼쳐집니다.</p>
            <div ref={coordinateGroupListRef} className="coordinate-group-list">
              {selectedCoordinateGroup.toilets.map((toilet, index) => {
                const isExpanded = expandedCoordinateToilet?.id === toilet.id
                return <div key={toilet.id} ref={(node) => { if (node) coordinateGroupItemRefs.current.set(toilet.id, node); else coordinateGroupItemRefs.current.delete(toilet.id) }} className={`coordinate-group-item${isExpanded ? ' is-expanded' : ''}`}>
                  <button type="button" className="coordinate-group-item-toggle" onClick={() => void toggleCoordinateToiletDetail(toilet)} aria-expanded={isExpanded}>
                    <span className="coordinate-group-index" aria-hidden="true">{index + 1}</span>
                    <span className="coordinate-group-name">{toilet.name || '이름 없는 공중화장실'}</span>
                    <span className="coordinate-group-toggle-label">{isExpanded ? '접기' : '상세 보기'}</span>
                  </button>
                  {isExpanded && <CoordinateGroupInlineDetails
                    toilet={toiletDetail}
                    isLoading={isDetailLoading}
                    error={detailError}
                  />}
                </div>
              })}
            </div>
          </aside>
        )}
      </section>
      <footer>지도 이동 또는 확대/축소 후 이 영역의 화장실을 다시 조회합니다.</footer>
    </main>
  )
}

function CoordinateGroupInlineDetails({ toilet, isLoading, error }: { toilet: ToiletDetailResponse | null; isLoading: boolean; error: string | null }) {
  if (isLoading) return <div className="coordinate-inline-details"><p className="coordinate-inline-status">상세 정보를 불러오는 중…</p></div>
  if (error) return <div className="coordinate-inline-details"><p className="detail-error" role="alert">{error}</p></div>
  if (!toilet) return null

  const address = toilet.roadAddress || toilet.jibunAddress

  return <div className="coordinate-inline-details">
    <p className="open-time">{formatOpenTime(toilet)}</p>
    {address && <DetailRow className="coordinate-inline-address" label="주소" value={address} copyable />}
    <section className="coordinate-inline-section coordinate-inline-capacity-section" aria-label="화장실 수">
      <h2>화장실 수</h2>
      <dl className="coordinate-inline-capacity">
        <div><dt>남성 대변기</dt><dd>{toilet.maleToiletCount}<small>대</small></dd></div>
        <div><dt>여성 대변기</dt><dd>{toilet.femaleToiletCount}<small>대</small></dd></div>
      </dl>
    </section>
    <section className="coordinate-inline-facilities" aria-label="편의 및 안전">
      <h2>편의·안전</h2>
      <div className="coordinate-facility-list">
        <CompactFacilityStatus label="비상벨" available={toilet.hasEmergencyBell === 'Y'} location={toilet.emergencyBellLocation} />
        <CompactFacilityStatus label="CCTV" available={toilet.hasCctv === 'Y'} />
        <CompactFacilityStatus label="기저귀 교환대" available={toilet.hasDiaperTable === 'Y'} location={toilet.diaperTableLocation} />
      </div>
    </section>
    {hasValue(toilet.agencyName) && <DetailRow className="coordinate-inline-agency" label="관리기관" value={toilet.agencyName} />}
  </div>
}

function CompactFacilityStatus({ label, available, location }: { label: string; available: boolean; location?: string }) {
  if (!available) return <div className="coordinate-facility"><span>{label}</span><strong className="is-unavailable">미설치</strong></div>
  if (!hasValue(location ?? '')) return <div className="coordinate-facility"><span>{label}</span><strong>설치됨</strong></div>

  return <details className="coordinate-facility coordinate-facility-with-location">
    <summary><span>{label}</span><strong>설치됨</strong><span className="coordinate-facility-location">위치 보기 <i aria-hidden="true" /></span></summary>
    <p>{formatFacilityLocation(location ?? '')}</p>
  </details>
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
      {hasValue(toilet.installationDate) && <DetailRow label="설치연월" value={formatInstallationDate(toilet.installationDate)} />}
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

  if (!hasValue(location ?? '')) {
    return <div className="facility-row"><strong>{label}</strong><span className="facility-status">설치됨</span><span className="facility-location-placeholder" aria-hidden="true" /></div>
  }

  return <details className="facility-row facility-row-expandable">
    <summary><strong>{label}</strong><span className="facility-status">설치됨</span><span className="facility-location-label">위치 보기 <span className="facility-location-arrow" aria-hidden="true" /></span></summary>
    <p>위치: {formatFacilityLocation(location ?? '')}</p>
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
