'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { fetchToiletsInBounds, type ToiletDetailResponse, type ToiletMapSearchResponse } from './api/toilets'
import { getCurrentUser, logout, startSocialLogin, type AuthProfile } from './api/auth'
import { createKakaoMap, searchKakaoPlaces, type KakaoMapInstance, type KakaoOverlay, type KakaoPlace } from './lib/kakaoMap'
import { ToiletReportModal } from './components/ToiletReportModal'
import { MyReportsPanel } from './components/MyReportsPanel'
import { NotificationPanel } from './components/NotificationPanel'
import { PolicyConsentModal } from './components/PolicyConsentModal'
import { PolicyFooter } from './components/PolicyPage'
import { AccountDialog } from './components/AccountDialog'
import { fetchUnreadNotificationCount } from './api/notifications'
import { getDisplayAddress } from './lib/address'
import { ToiletDetailContents, DetailRow } from './components/ToiletDetailContents'
import { hasValue, formatOpenTime, formatFacilityLocation } from './lib/detailFormatting'
import { toiletCoordinates } from './lib/toiletRoute'
import type { MapRouteData } from './components/mapRouteContext'
const toiletMarkerLogo = '/toilet-marker-logo.svg'

const DAEJEON_CITY_HALL = { latitude: 36.3504, longitude: 127.3845 }
const CLUSTER_GRID_SIZE = 84
const MAX_LIST_ZOOM_LEVEL = 6

type ToiletMapItem = { id: number; name: string; toiletType?: string; latitude: number; longitude: number }
type MapPoint = { id?: number; latitude: number; longitude: number; count: number; name?: string; toilets?: ToiletMapItem[] }
type SelectedToilet = { id: number; name: string; latitude: number; longitude: number }
type SelectedCoordinateGroup = { latitude: number; longitude: number; toilets: ToiletMapItem[] }
type CardPosition = { left: number; top: number }
type Coordinates = { latitude: number; longitude: number }
type ReportTarget = { toilet: ToiletDetailResponse; latitude: number; longitude: number }
type LoginPurpose = 'general' | 'report' | 'my-reports'

const PLACE_CARD_WIDTH = 360
const MAP_EDGE_GAP = 18
const PENDING_REPORT_TARGET_KEY = 'geupddong.pending-report-target'
const PENDING_MY_REPORTS_KEY = 'geupddong.pending-my-reports'


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

function formatLastUpdatedAt(updatedAt: Date | null) {
  if (!updatedAt) return '확인할 수 없음'
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(updatedAt)
}

function toiletTypeTone(toiletType?: string) {
  const normalizedType = toiletType?.replace(/\s/g, '') ?? ''
  if (normalizedType.includes('개방')) return 'is-open'
  if (normalizedType.includes('제보')) return 'is-reported'
  return 'is-public'
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

function coordinateGroupName(name: string) {
  return name
    .replace(/(?:지하|b)\s*\d+\s*층/gi, '')
    .replace(/\d+\s*층/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function sortCoordinateGroupToilets(toilets: ToiletMapItem[]) {
  const collator = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' })

  return [...toilets].sort((left, right) => {
    const nameComparison = collator.compare(coordinateGroupName(left.name), coordinateGroupName(right.name))
    if (nameComparison !== 0) return nameComparison

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

function MapApp({ route, onNavigate, onMounted }: { route: MapRouteData; onNavigate: (id: number | null) => void; onMounted: () => void }) {
  const [initialRoute] = useState(route)
  const initialRouteRef = useRef(initialRoute)
  const routeRef = useRef(route)
  useLayoutEffect(() => { routeRef.current = route }, [route])
  const initialCoordinates = toiletCoordinates(initialRoute.detail)
  const initialSelected = initialCoordinates && initialRoute.detail
    ? { id: initialRoute.detail.id, name: initialRoute.detail.name, ...initialCoordinates } : null
  const groupRef = useRef<SelectedCoordinateGroup | null>(null)
  const preserveGroupOnHomeRef = useRef(false)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<KakaoMapInstance | null>(null)
  const overlaysRef = useRef<KakaoOverlay[]>([])
  const toiletMarkerElementsRef = useRef(new Map<number, HTMLButtonElement>())
  const currentLocationOverlayRef = useRef<KakaoOverlay | null>(null)
  const searchLocationOverlayRef = useRef<KakaoOverlay | null>(null)
  const referencePointOverlayRef = useRef<KakaoOverlay | null>(null)
  const locationWatchIdRef = useRef<number | null>(null)
  const requestSequenceRef = useRef(0)
  const mapInteractionRef = useRef(false)
  const markerClickUntilRef = useRef(0)
  const selectedToiletRef = useRef<SelectedToilet | null>(initialSelected)
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
  const [lastSuccessfulMapUpdate, setLastSuccessfulMapUpdate] = useState<Date | null>(null)
  const [result, setResult] = useState<ToiletMapSearchResponse | null>(null)
  const [isMapReady, setIsMapReady] = useState(false)
  const [selectedToilet, setSelectedToilet] = useState<SelectedToilet | null>(initialSelected)
  const [selectedCoordinateGroup, setSelectedCoordinateGroup] = useState<SelectedCoordinateGroup | null>(null)
  const [expandedCoordinateToilet, setExpandedCoordinateToilet] = useState<SelectedToilet | null>(null)
  const [placeCardPosition, setPlaceCardPosition] = useState<CardPosition | null>(null)
  const [toiletDetail, setToiletDetail] = useState<ToiletDetailResponse | null>(initialRoute.detail)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [locationMessage, setLocationMessage] = useState<string | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [isMobileCardExpanded, setIsMobileCardExpanded] = useState(false)
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null)
  const [mapCenter, setMapCenter] = useState<Coordinates>(DAEJEON_CITY_HALL)
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 641px)').matches)
  const [placeSearchKeyword, setPlaceSearchKeyword] = useState('')
  const [placeSearchResults, setPlaceSearchResults] = useState<KakaoPlace[]>([])
  const [placeSearchMessage, setPlaceSearchMessage] = useState<string | null>(null)
  const [isPlaceSearching, setIsPlaceSearching] = useState(false)
  const [activePlaceSearchIndex, setActivePlaceSearchIndex] = useState(-1)
  const [isPlaceSearchFocused, setIsPlaceSearchFocused] = useState(false)
  const [isMobileAreaListOpen, setIsMobileAreaListOpen] = useState(false)
  const [mobileAreaToilets, setMobileAreaToilets] = useState<ToiletMapItem[] | null>(null)
  const [isMobileAreaListLoading, setIsMobileAreaListLoading] = useState(false)
  const [mapZoomLevel, setMapZoomLevel] = useState(3)
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
  const [authProfile, setAuthProfile] = useState<AuthProfile | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false)
  const [loginPurpose, setLoginPurpose] = useState<LoginPurpose>('general')
  const [isMyReportsOpen, setIsMyReportsOpen] = useState(false)
  const [focusedReportId, setFocusedReportId] = useState<number | null>(null)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  useLayoutEffect(() => { groupRef.current = selectedCoordinateGroup }, [selectedCoordinateGroup])
  useEffect(() => { onMounted() }, [onMounted])

  const showLocationMessage = useCallback((message: string) => {
    window.clearTimeout(locationMessageTimerRef.current)
    setLocationMessage(message)
    locationMessageTimerRef.current = window.setTimeout(() => setLocationMessage(null), 4_000)
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 641px)')
    const updateViewport = () => setIsDesktop(mediaQuery.matches)
    updateViewport()
    mediaQuery.addEventListener('change', updateViewport)
    return () => mediaQuery.removeEventListener('change', updateViewport)
  }, [])

  const resumePendingLoginAction = useCallback(() => {
    if (new URLSearchParams(window.location.search).get('login') !== 'success') return

    const url = new URL(window.location.href)
    url.searchParams.delete('login')
    url.searchParams.delete('consent')
    window.history.replaceState(window.history.state, '', url)

    try {
      const openMyReports = window.sessionStorage.getItem(PENDING_MY_REPORTS_KEY) === 'true'
      window.sessionStorage.removeItem(PENDING_MY_REPORTS_KEY)
      if (openMyReports) {
        setIsMyReportsOpen(true)
        return
      }
      const savedTarget = window.sessionStorage.getItem(PENDING_REPORT_TARGET_KEY)
      window.sessionStorage.removeItem(PENDING_REPORT_TARGET_KEY)
      if (!savedTarget) return

      const target = JSON.parse(savedTarget) as Partial<ReportTarget>
      if (!target.toilet || !Number.isFinite(target.latitude) || !Number.isFinite(target.longitude)) return
      setReportTarget(target as ReportTarget)
      setIsLoginDialogOpen(false)
    } catch {
      try { window.sessionStorage.removeItem(PENDING_REPORT_TARGET_KEY) } catch { /* 저장소 사용 불가 환경 */ }
    }
  }, [])

  useEffect(() => {
    let active = true
    void getCurrentUser()
      .then((profile) => {
        if (!active) return
        setAuthProfile(profile)
        if (profile && !profile.consentRequired) resumePendingLoginAction()
      })
      .catch(() => { if (active) setAuthProfile(null) })
      .finally(() => {
        if (!active) return
        setIsAuthLoading(false)
        const url = new URL(window.location.href)
        if (url.searchParams.get('login') === 'failed') {
          url.searchParams.delete('login')
          window.history.replaceState(window.history.state, '', url)
          showLocationMessage('로그인이 취소되었거나 완료되지 않았습니다. 다시 시도해 주세요.')
        }
      })
    return () => { active = false }
  }, [resumePendingLoginAction, showLocationMessage])

  const openReport = useCallback((target: ReportTarget) => {
    if (!authProfile) {
      try { window.sessionStorage.setItem(PENDING_REPORT_TARGET_KEY, JSON.stringify(target)) } catch { /* 저장소 사용 불가 환경에서도 로그인은 계속 제공한다. */ }
      setLoginPurpose('report')
      setIsLoginDialogOpen(true)
      return
    }
    if (authProfile.consentRequired) {
      showLocationMessage('제보를 시작하려면 필수 약관에 먼저 동의해 주세요.')
      return
    }
    setReportTarget(target)
  }, [authProfile, showLocationMessage])

  const openMyReports = useCallback(() => {
    if (!authProfile) {
      try { window.sessionStorage.setItem(PENDING_MY_REPORTS_KEY, 'true') } catch { /* 저장소 사용 불가 환경 */ }
      setLoginPurpose('my-reports')
      setIsLoginDialogOpen(true)
      return
    }
    if (authProfile.consentRequired) {
      showLocationMessage('내 제보를 확인하려면 필수 약관에 먼저 동의해 주세요.')
      return
    }
    setFocusedReportId(null)
    setIsMyReportsOpen(true)
  }, [authProfile, showLocationMessage])

  const refreshNotificationCount = useCallback(() => {
    if (!authProfile) return
    void fetchUnreadNotificationCount().then(setUnreadNotificationCount).catch(() => undefined)
  }, [authProfile])

  useEffect(() => {
    if (!authProfile) return
    void fetchUnreadNotificationCount().then(setUnreadNotificationCount).catch(() => undefined)
    const interval = window.setInterval(refreshNotificationCount, 60_000)
    return () => window.clearInterval(interval)
  }, [authProfile, refreshNotificationCount])

  const closeLoginDialog = useCallback(() => {
    try { window.sessionStorage.removeItem(PENDING_REPORT_TARGET_KEY) } catch { /* 저장소 사용 불가 환경 */ }
    try { window.sessionStorage.removeItem(PENDING_MY_REPORTS_KEY) } catch { /* 저장소 사용 불가 환경 */ }
    setIsLoginDialogOpen(false)
  }, [])

  const handleLogout = useCallback(() => {
    void logout()
      .then(() => { setAuthProfile(null); setUnreadNotificationCount(0); setIsNotificationsOpen(false) })
      .catch((logoutError: unknown) => showLocationMessage(logoutError instanceof Error ? logoutError.message : '로그아웃하지 못했습니다.'))
  }, [showLocationMessage])

  const handleConsentComplete = useCallback(() => {
    setAuthProfile((profile) => profile ? { ...profile, status: 'ACTIVE', consentRequired: false } : profile)
    if (new URLSearchParams(window.location.search).get('returnTo') === 'admin') {
      window.location.assign('https://admin.geupddong.com')
      return
    }
    showLocationMessage('약관 동의가 완료되었습니다.')
    resumePendingLoginAction()
  }, [resumePendingLoginAction, showLocationMessage])

  const handleWithdrawn = useCallback(() => {
    setIsAccountOpen(false)
    setAuthProfile(null)
    setUnreadNotificationCount(0)
    showLocationMessage('회원 탈퇴가 완료되었습니다.')
  }, [showLocationMessage])

  const clearOverlays = useCallback(() => {
    overlaysRef.current.forEach((overlay) => overlay.setMap(null))
    overlaysRef.current = []
    toiletMarkerElementsRef.current.clear()
  }, [])

  const suppressMapClickFromMarker = useCallback((event: Event) => {
    event.stopPropagation()
    markerClickUntilRef.current = Date.now() + 250
  }, [])

  const updateReferencePoint = useCallback((coordinates: Coordinates) => {
    const map = mapRef.current
    if (!map) return

    setMapCenter(coordinates)
    referencePointOverlayRef.current?.setMap(null)
    const content = document.createElement('div')
    content.className = 'map-reference-marker'
    content.setAttribute('aria-label', '거리 기준점')
    content.innerHTML = '<span class="map-reference-marker-pin" aria-hidden="true"><span></span></span><span class="map-reference-marker-label">기준점</span>'
    referencePointOverlayRef.current = new window.kakao.maps.CustomOverlay({
      position: new window.kakao.maps.LatLng(coordinates.latitude, coordinates.longitude),
      content,
      yAnchor: 1,
      zIndex: 4,
    })
    referencePointOverlayRef.current.setMap(map)
  }, [])

  const positionPlaceCardAtToilet = useCallback((toilet: SelectedToilet, cardHeight: number) => {
    const container = mapContainerRef.current
    const map = mapRef.current
    if (!container || !map) return

    const marker = toiletMarkerElementsRef.current.get(toilet.id)
    const markerRect = marker?.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const sectionRect = container.parentElement?.getBoundingClientRect() ?? containerRect
    const point = markerRect && marker?.isConnected
      ? {
          x: markerRect.left - sectionRect.left + (markerRect.width / 2),
          y: markerRect.top - sectionRect.top + markerRect.height,
        }
      : (() => {
          const projected = map.getProjection().pointFromCoords(new window.kakao.maps.LatLng(toilet.latitude, toilet.longitude))
          return { x: projected.x + container.offsetLeft, y: projected.y + container.offsetTop }
        })()
    const mapBounds = {
      left: containerRect.left - sectionRect.left + MAP_EDGE_GAP,
      top: containerRect.top - sectionRect.top + MAP_EDGE_GAP,
      right: containerRect.right - sectionRect.left - MAP_EDGE_GAP,
      bottom: containerRect.bottom - sectionRect.top - MAP_EDGE_GAP,
    }
    const cardWidth = Math.min(PLACE_CARD_WIDTH, mapBounds.right - mapBounds.left)
    const markerCenterY = point.y - ((markerRect?.height ?? 34) / 2)
    const candidates = [
      { left: point.x - (cardWidth / 2), top: point.y - cardHeight - MAP_EDGE_GAP },
      { left: point.x - (cardWidth / 2), top: point.y + MAP_EDGE_GAP },
      { left: point.x + MAP_EDGE_GAP, top: markerCenterY - (cardHeight / 2) },
      { left: point.x - cardWidth - MAP_EDGE_GAP, top: markerCenterY - (cardHeight / 2) },
    ]
    const fitsMapBounds = (candidate: CardPosition) => (
      candidate.left >= mapBounds.left
      && candidate.top >= mapBounds.top
      && candidate.left + cardWidth <= mapBounds.right
      && candidate.top + cardHeight <= mapBounds.bottom
    )
    const preferredPosition = candidates.find(fitsMapBounds)
    const left = preferredPosition?.left ?? Math.min(Math.max(point.x - (cardWidth / 2), mapBounds.left), mapBounds.right - cardWidth)
    const top = preferredPosition?.top ?? Math.min(Math.max(point.y + MAP_EDGE_GAP, mapBounds.top), mapBounds.bottom - cardHeight)
    setPlaceCardPosition((current) => current && Math.abs(current.left - left) < 1 && Math.abs(current.top - top) < 1 ? current : { left, top })
  }, [])

  const resetDetailCard = useCallback(() => {
    selectedToiletRef.current = null
    setSelectedToilet(null)
    setSelectedCoordinateGroup(null)
    setExpandedCoordinateToilet(null)
    setPlaceCardPosition(null)
    setToiletDetail(null)
    setDetailError(null)
    setIsDetailLoading(false)
    setIsMobileCardExpanded(false)
    setReportTarget(null)
    setIsMobileAreaListOpen(false)
    toiletMarkerElementsRef.current.forEach((marker) => marker.classList.remove('is-selected'))
  }, [])

  const closeDetailCard = useCallback(() => {
    preserveGroupOnHomeRef.current = false
    resetDetailCard()
    onNavigate(null)
  }, [onNavigate, resetDetailCard])

  useEffect(() => {
    const detail = route.detail
    if (!detail) {
      if (preserveGroupOnHomeRef.current) {
        preserveGroupOnHomeRef.current = false
        setToiletDetail(null)
        setExpandedCoordinateToilet(null)
        setIsDetailLoading(false)
      } else resetDetailCard()
      return
    }
    preserveGroupOnHomeRef.current = false
    const coordinates = toiletCoordinates(detail)
    const selected = coordinates ? { id: detail.id, name: detail.name, ...coordinates } : null
    const inGroup = selected && groupRef.current?.toilets.some(item => item.id === detail.id)
    selectedToiletRef.current = inGroup ? null : selected
    setSelectedToilet(inGroup ? null : selected)
    setExpandedCoordinateToilet(inGroup ? selected : null)
    if (!inGroup) setSelectedCoordinateGroup(null)
    setToiletDetail(detail)
    setDetailError(null)
    setIsDetailLoading(false)
    toiletMarkerElementsRef.current.forEach((marker, id) => marker.classList.toggle('is-selected', id === detail.id))
    // URL/history changes update only selection. Never pan, zoom or fetch map bounds here.
    if (inGroup) {
      const frame = window.requestAnimationFrame(() => {
        const list = coordinateGroupListRef.current
        const item = coordinateGroupItemRefs.current.get(detail.id)
        if (list && item) list.scrollTo({ top: Math.max(0, item.offsetTop - list.offsetTop - 8) })
      })
      return () => window.cancelAnimationFrame(frame)
    }
  }, [route, resetDetailCard])

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

  const selectToilet = useCallback((toiletId: number, name: string, latitude: number, longitude: number, keepCoordinateGroup = false) => {
    const selected = { id: toiletId, name, latitude, longitude }
    selectedToiletRef.current = selected
    setExpandedCoordinateToilet(null)
    if (!keepCoordinateGroup || !window.matchMedia('(min-width: 641px)').matches) setSelectedCoordinateGroup(null)
    toiletMarkerElementsRef.current.forEach((marker, markerId) => marker.classList.toggle('is-selected', markerId === toiletId))
    setSelectedToilet(selected)
    setPlaceCardPosition(null)
    setIsMobileCardExpanded(false)
    const cached = routeRef.current.detail?.id === toiletId ? routeRef.current.detail : null
    setToiletDetail(cached)
    setDetailError(null)
    setIsDetailLoading(!cached)
    onNavigate(toiletId)
  }, [onNavigate])

  const openCoordinateGroup = useCallback((point: MapPoint) => {
    if (!point.toilets) return
    resetDetailCard()
    preserveGroupOnHomeRef.current = true
    onNavigate(null)
    setSelectedCoordinateGroup({ latitude: point.latitude, longitude: point.longitude, toilets: sortCoordinateGroupToilets(point.toilets) })
  }, [onNavigate, resetDetailCard])

  const toggleCoordinateToiletDetail = useCallback((toilet: ToiletMapItem) => {
    if (expandedCoordinateToilet?.id === toilet.id) {
      preserveGroupOnHomeRef.current = true
      onNavigate(null)
      setExpandedCoordinateToilet(null)
      setToiletDetail(null)
      setDetailError(null)
      setIsDetailLoading(false)
      return
    }

    selectedToiletRef.current = null
    setSelectedToilet(null)
    setPlaceCardPosition(null)
    setExpandedCoordinateToilet(toilet)
    const cached = routeRef.current.detail?.id === toilet.id ? routeRef.current.detail : null
    setToiletDetail(cached)
    setDetailError(null)
    setIsDetailLoading(!cached)
    onNavigate(toilet.id)

    const scrollExpandedItemIntoView = () => {
      const list = coordinateGroupListRef.current
      const item = coordinateGroupItemRefs.current.get(toilet.id)
      if (!list || !item) return

      const itemTop = item.offsetTop - list.offsetTop
      list.scrollTo({ top: Math.max(0, itemTop - 8), behavior: 'smooth' })
    }

    requestAnimationFrame(scrollExpandedItemIntoView)

  }, [expandedCoordinateToilet, onNavigate])

  useEffect(() => {
    const selected = selectedToilet ?? expandedCoordinateToilet
    const map = mapRef.current
    if (!isMapReady || !selected || !map || toiletMarkerElementsRef.current.has(selected.id)) return
    // A directly linked toilet can be absent from the current clustered/bounds response.
    // Show its real coordinate without moving the map or requesting the list again.
    const content = document.createElement('button')
    content.type = 'button'
    content.className = 'toilet-marker is-selected'
    content.setAttribute('aria-label', selected.name)
    const pin = document.createElement('span')
    pin.className = 'toilet-marker-pin'
    const logo = document.createElement('img')
    logo.className = 'toilet-marker-logo'
    logo.src = toiletMarkerLogo
    logo.alt = ''
    pin.append(logo)
    content.append(pin)
    content.addEventListener('pointerdown', suppressMapClickFromMarker)
    content.addEventListener('click', suppressMapClickFromMarker)
    const overlay = new window.kakao.maps.CustomOverlay({
      position: new window.kakao.maps.LatLng(selected.latitude, selected.longitude), content, yAnchor: 1, zIndex: 3,
    })
    overlay.setMap(map)
    return () => overlay.setMap(null)
  }, [selectedToilet, expandedCoordinateToilet, result, isMapReady, suppressMapClickFromMarker])

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
        content.addEventListener('pointerdown', suppressMapClickFromMarker)
        content.addEventListener('click', (event) => {
          suppressMapClickFromMarker(event)
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
      content.addEventListener('pointerdown', suppressMapClickFromMarker)
      if (point.id != null) {
        toiletMarkerElementsRef.current.set(point.id, content)
        content.classList.toggle('is-selected', selectedToiletRef.current?.id === point.id)
      }
      content.addEventListener('click', (event) => {
        suppressMapClickFromMarker(event)
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
  }, [clearOverlays, openCoordinateGroup, selectToilet, suppressMapClickFromMarker])

  const loadMapArea = useCallback(async () => {
    const map = mapRef.current
    if (!map) return

    const requestSequence = ++requestSequenceRef.current
    const bounds = map.getBounds()
    const southWest = bounds.getSouthWest()
    const northEast = bounds.getNorthEast()

    setIsLoading(true)
    try {
      const response = await fetchToiletsInBounds({
        southLat: southWest.getLat(),
        northLat: northEast.getLat(),
        westLng: southWest.getLng(),
        eastLng: northEast.getLng(),
        zoom: map.getLevel(),
        includeList: window.matchMedia('(min-width: 641px)').matches && map.getLevel() <= MAX_LIST_ZOOM_LEVEL,
      })

      if (requestSequence !== requestSequenceRef.current) return
      setResult(response)
      setError(null)
      setLastSuccessfulMapUpdate(new Date())
      setMobileAreaToilets(null)
      renderResult(map, response)
    } catch {
      if (requestSequence === requestSequenceRef.current) {
        setError('화장실 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
      }
    } finally {
      if (requestSequence === requestSequenceRef.current) setIsLoading(false)
    }
  }, [renderResult])

  useEffect(() => {
    if (!error || !result) return
    const interval = window.setInterval(() => void loadMapArea(), 30_000)
    return () => window.clearInterval(interval)
  }, [error, loadMapArea, result])

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
      updateReferencePoint(coordinates)
      map.setLevel(Math.min(map.getLevel(), 4))
      map.panTo(position)
    }
  }, [updateReferencePoint])

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
    updateReferencePoint({ latitude: place.latitude, longitude: place.longitude })
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
  }, [closeDetailCard, updateReferencePoint])

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
    const controller = new AbortController()
    let resizeObserver: ResizeObserver | undefined
    const container = mapContainerRef.current
    if (!container) return

    async function initialize() {
      if (!container) return

      try {
        const center = toiletCoordinates(initialRouteRef.current.detail) ?? DAEJEON_CITY_HALL
        const map = await createKakaoMap(container, center, initialRouteRef.current.detail ? 4 : 6, controller.signal)
        if (disposed) return
        mapRef.current = map
        setIsMapReady(true)
        setMapZoomLevel(map.getLevel())
        updateReferencePoint(center)
        window.kakao.maps.event.addListener(map, 'idle', () => {
          if (disposed) return
          if (mapInteractionRef.current) {
            mapInteractionRef.current = false
            setIsMobileAreaListOpen(false)
            if (window.matchMedia('(min-width: 641px)').matches) closeDetailCard()
          }
          scheduleMapAreaLoad()
          positionSelectedCard()
        })
        const markMapInteraction = () => {
          if (disposed) return
          mapInteractionRef.current = true
          setIsMobileAreaListOpen(false)
        }
        window.kakao.maps.event.addListener(map, 'dragstart', markMapInteraction)
        window.kakao.maps.event.addListener(map, 'zoom_changed', markMapInteraction)
        window.kakao.maps.event.addListener(map, 'zoom_changed', () => { if (!disposed) setMapZoomLevel(map.getLevel()) })
        window.kakao.maps.event.addListener(map, 'click', (event) => {
          if (disposed) return
          setIsMobileAreaListOpen(false)
          if (Date.now() < markerClickUntilRef.current) return
          if (window.matchMedia('(min-width: 641px)').matches && event?.latLng) {
            updateReferencePoint({ latitude: event.latLng.getLat(), longitude: event.latLng.getLng() })
            map.panTo(event.latLng)
          }
        })
        resizeObserver = new ResizeObserver(() => map.relayout())
        resizeObserver.observe(container)
        await loadMapArea()
        if (!disposed && !initialRouteRef.current.detail) void moveToCurrentLocation(true)
      } catch (caughtError) {
        if (disposed) return
        setIsLoading(false)
        setError(caughtError instanceof Error ? caughtError.message : '지도를 불러오지 못했습니다.')
      }
    }

    void initialize()
    return () => {
      disposed = true
      controller.abort()
      requestSequenceRef.current += 1
      mapRef.current = null
      setIsMapReady(false)
      clearOverlays()
      currentLocationOverlayRef.current?.setMap(null)
      searchLocationOverlayRef.current?.setMap(null)
      referencePointOverlayRef.current?.setMap(null)
      if (locationWatchIdRef.current != null) {
        navigator.geolocation?.clearWatch(locationWatchIdRef.current)
        locationWatchIdRef.current = null
      }
      resizeObserver?.disconnect()
      // The SDK owns this empty React div. Remove its DOM when dev HMR/Strict Mode disposes it.
      container.replaceChildren()
      window.clearTimeout(mapLoadTimerRef.current)
      window.clearTimeout(locationMessageTimerRef.current)
    }
  }, [clearOverlays, closeDetailCard, loadMapArea, moveToCurrentLocation, positionSelectedCard, scheduleMapAreaLoad, updateReferencePoint])

  const distanceReference = isDesktop ? mapCenter : currentLocation
  const distanceReferenceLabel = isDesktop ? '기준점에서 약' : '내 위치에서 약'
  const distanceToSelectedToilet = distanceReference && selectedToilet
    ? formatDistance(calculateDistanceInMeters(distanceReference, selectedToilet))
    : null
  const distanceToCoordinateGroup = distanceReference && selectedCoordinateGroup
    ? formatDistance(calculateDistanceInMeters(distanceReference, selectedCoordinateGroup))
    : null
  const hasMapCard = selectedToilet != null || selectedCoordinateGroup != null
  const isListZoomLimited = mapZoomLevel > MAX_LIST_ZOOM_LEVEL
  const areaToilets = useMemo(
    () => isListZoomLimited ? [] : mobileAreaToilets ?? result?.toilets ?? [],
    [isListZoomLimited, mobileAreaToilets, result?.toilets],
  )
  const groupedAreaToilets = groupToiletsByCoordinate(areaToilets)
  const sortedAreaToiletGroups = distanceReference
    ? [...groupedAreaToilets].sort((left, right) => calculateDistanceInMeters(distanceReference, left) - calculateDistanceInMeters(distanceReference, right))
    : groupedAreaToilets

  const toggleMobileAreaList = useCallback(async () => {
    if (isMobileAreaListOpen) {
      setIsMobileAreaListOpen(false)
      return
    }

    const map = mapRef.current
    if (!map || !result) return

    closeDetailCard()
    setIsMobileAreaListOpen(true)
    if (map.getLevel() > MAX_LIST_ZOOM_LEVEL) return
    if (result.meta.display_type !== 'CLUSTER') return

    const bounds = map.getBounds()
    const southWest = bounds.getSouthWest()
    const northEast = bounds.getNorthEast()
    setIsMobileAreaListLoading(true)
    try {
      const response = await fetchToiletsInBounds({
        southLat: southWest.getLat(),
        northLat: northEast.getLat(),
        westLng: southWest.getLng(),
        eastLng: northEast.getLng(),
        zoom: map.getLevel(),
        includeList: true,
      })
      setMobileAreaToilets(response.toilets)
    } catch {
      setMobileAreaToilets([])
    } finally {
      setIsMobileAreaListLoading(false)
    }
  }, [closeDetailCard, isMobileAreaListOpen, result])

  const selectMobileAreaToilet = useCallback((toilet: ToiletMapItem) => {
    const map = mapRef.current
    if (!map) return

    const sameCoordinateToilets = areaToilets.filter((item) => item.latitude === toilet.latitude && item.longitude === toilet.longitude)
    const position = new window.kakao.maps.LatLng(toilet.latitude, toilet.longitude)
    setIsMobileAreaListOpen(false)
    if (sameCoordinateToilets.length > 1) {
      openCoordinateGroup({ latitude: toilet.latitude, longitude: toilet.longitude, count: sameCoordinateToilets.length, toilets: sameCoordinateToilets })
    } else {
      void selectToilet(toilet.id, toilet.name, toilet.latitude, toilet.longitude)
    }
    if (!window.matchMedia('(min-width: 641px)').matches) map.panTo(position)
  }, [areaToilets, openCoordinateGroup, selectToilet])

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
        <div className="auth-actions">
          {isAuthLoading && <span className="auth-status">확인 중…</span>}
          {!isAuthLoading && authProfile && <button type="button" className="notification-button" onClick={() => setIsNotificationsOpen(true)} aria-label={unreadNotificationCount ? `읽지 않은 알림 ${unreadNotificationCount}개` : '알림'}><span aria-hidden="true" />{unreadNotificationCount > 0 && <strong>{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</strong>}</button>}
          {!isAuthLoading && <button type="button" className="auth-button is-secondary" onClick={openMyReports}>내 제보</button>}
          {!isAuthLoading && authProfile && <><button type="button" className="auth-button is-secondary" onClick={() => setIsAccountOpen(true)}>내 계정</button><button type="button" className="auth-button is-logout" onClick={handleLogout}>로그아웃</button></>}
          {!isAuthLoading && !authProfile && <button type="button" className="auth-button" onClick={() => { setLoginPurpose('general'); setIsLoginDialogOpen(true) }}>로그인</button>}
        </div>
      </header>

      <section className="map-section" aria-label="공중화장실 지도">
        <div ref={mapContainerRef} className="map" />
        {error && result && <div className="connection-status-banner" role="alert">
          <span className="connection-status-dot" aria-hidden="true" />
          <div>
            <strong>서버 연결이 끊겼습니다</strong>
            <span>마지막 정상 갱신 {formatLastUpdatedAt(lastSuccessfulMapUpdate)}</span>
          </div>
          <button type="button" onClick={() => void loadMapArea()} disabled={isLoading}>{isLoading ? '연결 중…' : '다시 연결'}</button>
        </div>}
        <p className="desktop-map-reference-hint">지도를 클릭해 거리 기준점을 옮길 수 있어요.</p>
        <div className={`map-controls${hasMapCard ? ' is-with-card' : ''}`}>
          <div className="map-hud" aria-live="polite">
            {isLoading && <span className="map-loading-message">지도를 조회하는 중…</span>}
            {!isLoading && result && <span className="map-area-count">이 지역 {result.meta.total_count.toLocaleString()}곳{result.meta.display_type === 'CLUSTER' ? ' · 묶어서 표시 중' : ''}</span>}
            {result && <button className={`mobile-area-list-button${isMobileAreaListOpen ? ' is-open' : ''}${isLoading ? ' is-loading' : ''}`} type="button" onClick={() => void toggleMobileAreaList()} aria-expanded={isMobileAreaListOpen} aria-busy={isLoading} disabled={isLoading}>{isLoading ? '지도를 조회하는 중…' : isMobileAreaListOpen ? '목록 닫기' : `이 지역 ${result.meta.total_count.toLocaleString()}곳`}</button>}
            {error && !result && <span className="error-message">{error}</span>}
          </div>
          <button className={`location-button${hasMapCard ? ' is-with-card' : ''}`} type="button" onClick={() => void moveToCurrentLocation()} disabled={isLocating}>
            {isLocating ? '확인 중' : '현재 위치'}
          </button>
        </div>
        {isDesktop && result && <aside className="desktop-area-list" aria-label="현재 지도 영역 화장실 목록">
          <header className="desktop-area-list-header">
            <div>
              <strong>이 지역 {result.meta.total_count.toLocaleString()}곳</strong>
              <span>지도 중심 기준 가까운 순</span>
            </div>
            {isLoading && <em>조회 중…</em>}
          </header>
          <div className="desktop-area-list-content">
            {isListZoomLimited && <p className="map-list-zoom-guide">화장실 목록을 보려면<br />지도를 더 확대해 주세요.</p>}
            {!isListZoomLimited && areaToilets.length === 0 && !isLoading && <p className="desktop-area-list-status">이 영역의 화장실 목록이 없습니다.</p>}
            {!isListZoomLimited && sortedAreaToiletGroups.map((group) => {
              const representative = group.toilets?.[0] ?? {
                id: group.id ?? 0,
                name: group.name ?? '',
                latitude: group.latitude,
                longitude: group.longitude,
              }
              const additionalCount = group.count - 1
              const distance = distanceReference ? formatDistance(calculateDistanceInMeters(distanceReference, representative)) : '—'
              return <button key={`${group.latitude}:${group.longitude}`} type="button" className="desktop-area-list-item" onClick={() => selectMobileAreaToilet(representative)}>
                <strong><span className="desktop-area-list-name">{representative.name || '이름 없는 공중화장실'}</span>{additionalCount > 0 && <span className="desktop-area-list-additional">외 {additionalCount}개</span>}</strong>
                <span className={`desktop-area-list-type ${toiletTypeTone(representative.toiletType)}`}>{representative.toiletType || '공중화장실'}</span>
                <span className="desktop-area-list-distance">{distance}</span>
              </button>
            })}
          </div>
        </aside>}
        {isMobileAreaListOpen && <aside className="mobile-area-list" aria-label="현재 지도 영역 화장실 목록">
          <button className="mobile-area-list-handle" type="button" onClick={() => setIsMobileAreaListOpen(false)} aria-label="지역 목록 닫기" />
          {!isListZoomLimited && <div className="mobile-area-list-header"><span>화장실명</span><span>구분</span><span>거리</span></div>}
          <div className="mobile-area-list-content">
            {isListZoomLimited && <p className="map-list-zoom-guide">화장실 목록을 보려면<br />지도를 더 확대해 주세요.</p>}
            {!isListZoomLimited && isMobileAreaListLoading && <p className="mobile-area-list-status">목록을 불러오는 중…</p>}
            {!isListZoomLimited && !isMobileAreaListLoading && areaToilets.length === 0 && <p className="mobile-area-list-status">이 영역의 화장실 목록이 없습니다.</p>}
            {!isListZoomLimited && !isMobileAreaListLoading && sortedAreaToiletGroups.map((group) => {
              const representative = group.toilets?.[0] ?? {
                id: group.id ?? 0,
                name: group.name ?? '',
                latitude: group.latitude,
                longitude: group.longitude,
              }
              const additionalCount = group.count - 1
              const distance = distanceReference ? formatDistance(calculateDistanceInMeters(distanceReference, representative)) : '—'
              return <button key={`${group.latitude}:${group.longitude}`} type="button" className="mobile-area-list-item" onClick={() => selectMobileAreaToilet(representative)}>
                <strong>
                  <span className="mobile-area-list-name">{representative.name || '이름 없는 공중화장실'}</span>
                  {additionalCount > 0 && <span className="mobile-area-list-additional">외 {additionalCount}개</span>}
                </strong>
                <span className={`mobile-area-list-type ${toiletTypeTone(representative.toiletType)}`}>{representative.toiletType || '공중화장실'}</span>
                <span className="mobile-area-list-distance">{distance}</span>
              </button>
            })}
          </div>
        </aside>}
        {locationMessage && <p className="location-message" role="status">{locationMessage}</p>}
        {toiletDetail && !toiletCoordinates(toiletDetail) && !selectedToilet && !selectedCoordinateGroup && (
          <aside className="place-card initial-route-card" aria-label="화장실 상세 정보">
            <button type="button" className="close-button" onClick={closeDetailCard} aria-label="정보 닫기">×</button>
            <h1>{toiletDetail.name}</h1>
            <p>등록된 좌표가 없어 지도에 위치를 표시할 수 없습니다.</p>
            <p className="open-time">{formatOpenTime(toiletDetail)}</p>
            <ToiletDetailContents toilet={toiletDetail} />
          </aside>
        )}
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
              <h1>{toiletDetail?.name || selectedToilet.name}</h1>
            </div>
            <div className="card-scroll-content">
              <p className="open-time">{toiletDetail ? formatOpenTime(toiletDetail) : isDetailLoading ? '상세 정보를 불러오는 중…' : '상세 정보를 확인해 주세요.'}</p>
              {distanceToSelectedToilet && <div className="distance-from-current"><span className="distance-label">{distanceReferenceLabel}</span><strong className="distance-value">{distanceToSelectedToilet}</strong><span className="distance-caption">(직선거리)</span></div>}
              {toiletDetail && hasValue(getDisplayAddress(toiletDetail.roadAddress, toiletDetail.jibunAddress)) && <div className="summary-address"><DetailRow label="주소" value={getDisplayAddress(toiletDetail.roadAddress, toiletDetail.jibunAddress)} copyable /></div>}
              {toiletDetail && <button type="button" className="report-entry-button" onClick={() => openReport({ toilet: toiletDetail, latitude: selectedToilet.latitude, longitude: selectedToilet.longitude })}>{authProfile ? '정보 제보하기' : '로그인 후 정보 제보하기'}</button>}
              {detailError && <p className="detail-error" role="alert">{detailError}</p>}
              {toiletDetail && <ToiletDetailContents toilet={toiletDetail} />}
            </div>
          </aside>
        )}
        {selectedCoordinateGroup && (
          <aside className="coordinate-group-card" aria-live="polite" aria-label="같은 위치 화장실 목록">
            <button type="button" className="close-button" onClick={closeDetailCard} aria-label="목록 닫기">×</button>
            <span className="card-label">동일 좌표로 등록됨</span>
            {distanceToCoordinateGroup && <p className="coordinate-group-distance">{distanceReferenceLabel} <strong>{distanceToCoordinateGroup}</strong></p>}
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
                    onReport={() => { if (toiletDetail) openReport({ toilet: toiletDetail, latitude: toilet.latitude, longitude: toilet.longitude }) }}
                  />}
                </div>
              })}
            </div>
          </aside>
        )}
        {reportTarget && <ToiletReportModal toilet={reportTarget.toilet} latitude={reportTarget.latitude} longitude={reportTarget.longitude} onClose={() => setReportTarget(null)} onViewMyReports={() => { setReportTarget(null); setIsMyReportsOpen(true) }} />}
        {isMyReportsOpen && <MyReportsPanel initialExpandedId={focusedReportId} onClose={() => { setIsMyReportsOpen(false); setFocusedReportId(null) }} />}
        {isNotificationsOpen && <NotificationPanel onClose={() => setIsNotificationsOpen(false)} onCountChange={refreshNotificationCount} onOpenReport={(reportId) => { setIsNotificationsOpen(false); setFocusedReportId(reportId); setIsMyReportsOpen(true) }} />}
        {isLoginDialogOpen && <LoginDialog purpose={loginPurpose} onClose={closeLoginDialog} />}
        {authProfile?.consentRequired && <PolicyConsentModal isNewRegistration={authProfile.status === 'PENDING_CONSENT'} onComplete={handleConsentComplete} onLogout={handleLogout} />}
        {authProfile && isAccountOpen && <AccountDialog profile={authProfile} onClose={() => setIsAccountOpen(false)} onWithdrawn={handleWithdrawn} />}
      </section>
      <footer className="site-footer"><p>지도 이동 또는 확대/축소 후 이 영역의 화장실을 다시 조회합니다.</p><PolicyFooter /></footer>
    </main>
  )
}

function LoginDialog({ purpose, onClose }: { purpose: LoginPurpose; onClose: () => void }) {
  const title = purpose === 'my-reports' ? '로그인하고 내 제보를 확인해 주세요' : purpose === 'report' ? '로그인하고 정보를 제보해 주세요' : '급똥에 로그인해 주세요'
  const description = purpose === 'my-reports' ? '내가 보낸 제보의 대기·승인·반려 상태와 관리자 메모를 확인할 수 있어요.' : '제보 내용은 관리자 확인 후 서비스에 반영됩니다.'
  return <div className="login-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-modal-title">
      <button type="button" className="login-modal-close" onClick={onClose} aria-label="로그인 창 닫기">×</button>
      <span>급똥 계정</span>
      <h1 id="login-modal-title">{title}</h1>
      <p>{description}</p>
      <button type="button" className="social-login google-login" onClick={() => startSocialLogin('google')}>Google로 계속하기</button>
      <button type="button" className="social-login kakao-login" onClick={() => startSocialLogin('kakao')}>Kakao로 계속하기</button>
      <p className="login-policy-note">처음 가입하는 경우에만 소셜 인증 후 만 14세 이상 확인과 필수 약관 동의가 이어집니다. 기존 회원은 바로 로그인됩니다.</p>
      <nav className="login-policy-links"><a href="/policies/terms" target="_blank" rel="noreferrer">이용약관</a><a href="/policies/privacy" target="_blank" rel="noreferrer">개인정보 처리방침</a></nav>
    </section>
  </div>
}

function CoordinateGroupInlineDetails({ toilet, isLoading, error, onReport }: { toilet: ToiletDetailResponse | null; isLoading: boolean; error: string | null; onReport: () => void }) {
  if (isLoading) return <div className="coordinate-inline-details"><p className="coordinate-inline-status">상세 정보를 불러오는 중…</p></div>
  if (error) return <div className="coordinate-inline-details"><p className="detail-error" role="alert">{error}</p></div>
  if (!toilet) return null

  const address = getDisplayAddress(toilet.roadAddress, toilet.jibunAddress)

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
    <button type="button" className="report-entry-button coordinate-report-entry" onClick={onReport}>정보 제보하기</button>
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


export default MapApp
