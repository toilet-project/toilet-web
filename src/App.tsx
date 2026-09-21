'use client'
import { PublicReviews, PublicReviewsLoading } from './components/reviews/PublicReviews'


import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { fetchToiletDetail, fetchToiletsInBounds, type ToiletDetailResponse, type ToiletMapSearchResponse } from './api/toilets'
import { createDetailCache } from './lib/detailCache'
import { createCardHandleGesture, createMarkerTapGesture, createReferenceRequestGate, relayoutPreservingCenter } from './lib/mapInteraction'
import { cardPlacement } from './lib/cardPlacement'
import Link from 'next/link'
import { ProfileMenu } from './components/ProfileMenu'
import { LanguageSelector } from './components/LanguageSelector'
import { toiletTypeLabel } from './i18n/facilityLabels'
import { mapSystemNotice, localizeMapLabels } from './i18n/mapLabels'
import { useLocale, useMessages } from './i18n/context'
import { message } from './i18n/messages'
import { ENGLISH_UI_ENABLED } from './i18n/feature'
import { isLanguageOnlyNavigation, localizedPublicPath } from './i18n/routes'
import type { Locale } from './i18n/locale'
import { MobileNavigation, MobilePage, type MobileTab, type MobileAccountView } from './components/MobileNavigation'
import { AppUpdateNotice } from './components/AppUpdateNotice'
import { readMapResume, saveMapResume, MAP_RESUME_KEY } from './lib/appUpdate'
import { MAP_NAVIGATION_EVENT, mapNavigationPath } from './lib/navigationCache'
import { mapSdkIdentity } from './lib/mapProviderSelection'
import { AuthExpiredError, getCurrentUser, logout, startSocialLogin, type AuthProfile } from './api/auth'
import {
  addMapEventListener,
  createMap,
  createMapCoordinate,
  createMapOverlay,
  destroyMap,
  NaverMapLanguageReloadRequired,
  preventMapEvent,
  type MapInstance,
  type MapOverlay,
} from './lib/mapProvider'
import { searchPlaces } from './lib/placeSearch'
import type { PlaceSearchResult } from './lib/placeSearchTypes'
import { ToiletReportModal } from './components/ToiletReportModal'
import { MyReportsPanel } from './components/MyReportsPanel'
import { NotificationPanel } from './components/NotificationPanel'
import { PolicyConsentModal } from './components/PolicyConsentModal'
import { PolicyFooter } from './components/PolicyPage'
import { AccountDialog } from './components/AccountDialog'
import { AccountRecoveryDialog } from './components/AccountRecoveryDialog'
import { fetchUnreadNotificationCount } from './api/notifications'
import { getDisplayAddress } from './lib/address'
import { ToiletDetailContents, DetailRow } from './components/ToiletDetailContents'
import { OriginalSourceBadge } from './components/OriginalSourceBadge'
import { ToiletCommunityRow, ToiletReportEntry } from './components/ToiletCommunityRow'
import { REVIEW_DESIGN_PREVIEW, type PreviewReviewSummary, type ReviewEntryState } from './components/reviews/useIntegratedReviewPreview'
import { REVIEW_API_ENABLED, REVIEW_UI_ENABLED, useReviews } from './components/reviews/useReviews'
import { readReviewTestToilet } from './lib/reviewTestToilet'
import { DetailLoadingFields, LoadingOpenTime } from './components/ToiletCardLoading'
import { hasValue, formatOpenTime, formatFacilityLocation, formatLastUpdatedAt } from './lib/detailFormatting'
import { BrandWordmark } from './components/BrandWordmark'
import { toiletCoordinates } from './lib/toiletRoute'
import { groupToiletsByCoordinate, representativeToilet, type ToiletMapItem, type MapPoint } from './lib/toiletGrouping'
import type { MapRouteData } from './components/mapRouteContext'
import { DESKTOP_LAYOUT_QUERY } from './lib/responsiveLayout'
import { resolveDistanceReference, type DistanceSource } from './lib/distanceReference'
import { TRANSIENT_NOTICE_MS } from './lib/uiTiming'
import { warmOwnPhoto } from './lib/warmOwnPhoto'
import { refreshSignupPhoto } from './lib/signupPhotoWarm'
import { prefetchPublicReviews, PUBLIC_REVIEW_API_ENABLED } from './lib/publicReviewPrefetch'
import { resultCountBucket, trackEvent } from './lib/analytics'
import { localizeToiletDetail, localizeToiletMapItem, localizeToiletMapSearch } from './i18n/toiletTranslations'
const toiletMarkerLogo = '/toilet-marker-logo.svg'

const DAEJEON_CITY_HALL = { latitude: 36.3504, longitude: 127.3845 }
const CLUSTER_GRID_SIZE = 84
const MAX_LIST_ZOOM_LEVEL = 6

type SelectedToilet = ToiletMapItem
type SelectedCoordinateGroup = { latitude: number; longitude: number; toilets: ToiletMapItem[]; displayGroupName?: string }
type CardPosition = { left: number; top: number }
type Coordinates = { latitude: number; longitude: number }
type ReportTarget = { toilet: ToiletDetailResponse; latitude: number; longitude: number }
type LoginPurpose = 'general' | 'report' | 'my-reports' | 'review'

const PLACE_CARD_WIDTH = 360
const MAP_EDGE_GAP = 18
const PENDING_REPORT_TARGET_KEY = 'geupddong.pending-report-target'
const PENDING_MY_REPORTS_KEY = 'geupddong.pending-my-reports'
const PENDING_MOBILE_TAB_KEY = 'geupddong.pending-mobile-tab'
const PENDING_INBOX_KEY = 'geupddong.pending-inbox'


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

function scrollCoordinateGroupItem(list: HTMLElement, item: HTMLElement, behavior: ScrollBehavior = 'auto') {
  const listBounds = list.getBoundingClientRect()
  const itemBounds = item.getBoundingClientRect()
  const top = list.scrollTop + itemBounds.top - listBounds.top - 8
  list.scrollTo({ top: Math.max(0, top), behavior })
}

function toiletTypeTone(toiletType?: string) {
  const normalizedType = toiletType?.replace(/\s/g, '') ?? ''
  if (normalizedType.includes('개방')) return 'is-open'
  if (normalizedType.includes('제보')) return 'is-reported'
  return 'is-public'
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

function groupPointsByScreenGrid(map: MapInstance, points: MapPoint[]) {
  const groups = new Map<string, MapPoint[]>()
  const projection = map.getProjection()

  for (const point of points) {
    const projected = projection.pointFromCoords(createMapCoordinate(map, point.latitude, point.longitude))
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

function MapApp({ route, onNavigate, onMounted, onLocaleChange, testToiletHash = '' }: { route: MapRouteData; onNavigate: (id: number | null) => void; onMounted: () => void; onLocaleChange: (locale: Locale, id: number | null) => void; testToiletHash?: string }) {
  const locale = useLocale()
  const mapRuntimeKey = mapSdkIdentity(locale)
  const t = useMessages()
  const mapLocale = useRef(locale)
  useLayoutEffect(() => {
    mapLocale.current = locale
    localizeMapLabels(mapContainerRef.current, locale)
  }, [locale])
  const previousRoutePath = useRef('')
  const [initialRoute] = useState(route)
  // MapShell remounts only when this explicit test link changes, clearing its memory reviews.
  const [testToilet] = useState(() => readReviewTestToilet(testToiletHash, REVIEW_DESIGN_PREVIEW))
  const initialDetail = initialRoute.detail ?? testToilet
  const pendingNavigationPath = useRef<string | null | undefined>(undefined)
  const [resume] = useState(() => {
    if (testToilet) return null
    try { return readMapResume(window.sessionStorage, window.location.pathname) } catch { return null }
  })
  const initialRouteRef = useRef(initialRoute)
  const [detailCache] = useState(() => {
    const cache = createDetailCache<ToiletDetailResponse>()
    if (route.detail) cache.set(route.detail)
    return cache
  })
  const initialCoordinates = toiletCoordinates(initialDetail)
  const initialSelected = initialCoordinates && initialDetail
    ? { id: initialDetail.id, name: initialDetail.name, ...initialCoordinates } : null
  const groupRef = useRef<SelectedCoordinateGroup | null>(null)
  const preserveGroupOnHomeRef = useRef(false)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapInstance | null>(null)
  const overlaysRef = useRef<MapOverlay[]>([])
  const toiletMarkerElementsRef = useRef(new Map<number, HTMLButtonElement>())
  const currentLocationOverlayRef = useRef<MapOverlay | null>(null)
  const searchLocationOverlayRef = useRef<MapOverlay | null>(null)
  const referencePointOverlayRef = useRef<MapOverlay | null>(null)
  const locationWatchIdRef = useRef<number | null>(null)
  const requestSequenceRef = useRef(0)
  const mapInteractionRef = useRef(false)
  const markerClickUntilRef = useRef(0)
  const selectedToiletRef = useRef<SelectedToilet | null>(initialSelected)
  const coordinateGroupListRef = useRef<HTMLDivElement>(null)
  const coordinateGroupItemRefs = useRef(new Map<number, HTMLDivElement>())
  const placeCardRef = useRef<HTMLElement>(null)
  const locationMessageTimerRef = useRef<number | undefined>(undefined)
  const [cardHandleGesture] = useState(createCardHandleGesture)
  const [referenceRequestGate] = useState(createReferenceRequestGate)
  const cardScrollRef = useRef<HTMLDivElement>(null)
  const placeSearchRequestRef = useRef(0)
  const placeSearchInputRef = useRef<HTMLInputElement>(null)
  const mapLoadTimerRef = useRef<number | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastSuccessfulMapUpdate, setLastSuccessfulMapUpdate] = useState<Date | null>(null)
  const [result, setResult] = useState<ToiletMapSearchResponse | null>(null)
  const [isMapReady, setIsMapReady] = useState(false)
  const [isMapSwitching, setIsMapSwitching] = useState(false)
  const [selectedToilet, setSelectedToilet] = useState<SelectedToilet | null>(initialSelected)
  const [selectedCoordinateGroup, setSelectedCoordinateGroup] = useState<SelectedCoordinateGroup | null>(null)
  const [expandedCoordinateToilet, setExpandedCoordinateToilet] = useState<SelectedToilet | null>(null)
  const [placeCardPosition, setPlaceCardPosition] = useState<CardPosition | null>(null)
  const [toiletDetail, setToiletDetail] = useState<ToiletDetailResponse | null>(initialDetail)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailRetry, setDetailRetry] = useState(0)
  const retryDetail = () => {
    setDetailError(null)
    setIsDetailLoading(true)
    setDetailRetry(value => value + 1)
  }
  const detailRef = useRef(toiletDetail)
  useLayoutEffect(() => { detailRef.current = toiletDetail }, [toiletDetail])
  const activeDetailId = selectedToilet?.id ?? expandedCoordinateToilet?.id ?? null
  // The DOM is reused for cached A → B → A selections. Do not retain a previous card's scroll.
  useLayoutEffect(() => {
    if (cardScrollRef.current) cardScrollRef.current.scrollTop = 0
    cardHandleGesture.cancel()
  }, [activeDetailId, cardHandleGesture])
  useEffect(() => {
    if (activeDetailId === null || activeDetailId === testToilet?.id || detailCache.get(activeDetailId)) return
    const controller = new AbortController()
    let disposed = false
    const timeout = window.setTimeout(() => controller.abort(), 10_000)
    // Fetch interactive content immediately; URL/SEO navigation can finish independently.
    void fetchToiletDetail(activeDetailId, controller.signal).then(detail => {
      if (disposed) return
      detailCache.set(detail)
      setToiletDetail(detail)
      setDetailError(null)
      setIsDetailLoading(false)
    }).catch(() => {
      if (disposed || detailRef.current?.id === activeDetailId) return
      setDetailError('상세 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
      setIsDetailLoading(false)
    }).finally(() => window.clearTimeout(timeout))
    return () => { disposed = true; controller.abort(); window.clearTimeout(timeout) }
  }, [activeDetailId, detailCache, detailRetry, testToilet])
  useEffect(() => {
    if (!PUBLIC_REVIEW_API_ENABLED || activeDetailId === null || activeDetailId <= 0 || activeDetailId === testToilet?.id) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => { void prefetchPublicReviews(activeDetailId, controller.signal).catch(() => undefined) }, 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [activeDetailId, testToilet?.id])
  const [locationMessage, setLocationMessage] = useState<string | null>(null)
  const [withdrawalNotice, setWithdrawalNotice] = useState<string | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [isMobileCardExpanded, setIsMobileCardExpanded] = useState(false)
  const isMobileCardExpandedRef = useRef(isMobileCardExpanded)
  useLayoutEffect(() => { isMobileCardExpandedRef.current = isMobileCardExpanded }, [isMobileCardExpanded])
  const [currentLocation, setCurrentLocation] = useState<Coordinates | null>(null)
  const [mapCenter, setMapCenter] = useState<Coordinates>(DAEJEON_CITY_HALL)
  const [distanceSource, setDistanceSource] = useState<DistanceSource>('point')
  const liveMapStateRef = useRef({ mapCenter, distanceSource, currentLocation })
  useLayoutEffect(() => {
    liveMapStateRef.current = { mapCenter, distanceSource, currentLocation }
  }, [mapCenter, distanceSource, currentLocation])
  const mapSwitchSnapshotRef = useRef<{
    center: Coordinates
    level: number
    reference: Coordinates
    source: DistanceSource
    currentLocation: Coordinates | null
  } | null>(null)
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(DESKTOP_LAYOUT_QUERY).matches)
  const [placeSearchKeyword, setPlaceSearchKeyword] = useState('')
  const [placeSearchResults, setPlaceSearchResults] = useState<PlaceSearchResult[]>([])
  const [placeSearchMessage, setPlaceSearchMessage] = useState<string | null>(null)
  const [isPlaceSearching, setIsPlaceSearching] = useState(false)
  const [activePlaceSearchIndex, setActivePlaceSearchIndex] = useState(-1)
  const [isPlaceSearchFocused, setIsPlaceSearchFocused] = useState(false)
  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get('q')?.trim()
    if (query && query.length >= 2 && query.length <= 100) {
      setPlaceSearchKeyword(query)
      setIsPlaceSearchFocused(true)
    }
  }, [])
  const [isMobileAreaListOpen, setIsMobileAreaListOpen] = useState(false)
  const isMobileAreaListVisible = isMobileAreaListOpen && !route.detail
  const [mobileAreaToilets, setMobileAreaToilets] = useState<ToiletMapItem[] | null>(null)
  const [isMobileAreaListLoading, setIsMobileAreaListLoading] = useState(false)
  const [mapZoomLevel, setMapZoomLevel] = useState(3)
  const [mobileZoomGuideKey, setMobileZoomGuideKey] = useState<number | null>(null)
  const mobileZoomGuideTimerRef = useRef<number | undefined>(undefined)
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
  const [authProfile, setAuthProfile] = useState<AuthProfile | null>(null)
  const currentUserRef = useRef<string | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false)
  const [loginPurpose, setLoginPurpose] = useState<LoginPurpose>('general')
  const [isMyReportsOpen, setIsMyReportsOpen] = useState(false)
  const [focusedReportId, setFocusedReportId] = useState<number | null>(null)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  const [isAccountOpen, setIsAccountOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('map')
  const [mobileAccountView, setMobileAccountView] = useState<MobileAccountView>('home')
  useEffect(() => {
    if (isDesktop || mobileTab === 'map' || mobileAccountView === 'reviews') return
    const screen = mobileTab === 'notifications' ? 'notifications'
      : mobileAccountView === 'reports' ? 'my_reports'
        : mobileAccountView === 'settings' ? 'account_settings' : 'account_home'
    trackEvent('screen_view', { screen })
  }, [isDesktop, mobileTab, mobileAccountView])
  useEffect(() => {
    if (!isDesktop) return
    const screen = isNotificationsOpen ? 'notifications'
      : isMyReportsOpen ? 'my_reports'
        : isAccountOpen ? 'account_settings' : ''
    if (screen) trackEvent('screen_view', { screen })
  }, [isDesktop, isNotificationsOpen, isMyReportsOpen, isAccountOpen])
  useLayoutEffect(() => {
    const next = authProfile?.userId ?? null
    // Initial OAuth return may already have selected a pending history destination.
    if (currentUserRef.current && currentUserRef.current !== next) setMobileAccountView('home')
    currentUserRef.current = next
  }, [authProfile?.userId])
  const showReportHistory = useCallback((reportId: number | null = null) => {
    setFocusedReportId(reportId)
    if (window.matchMedia(DESKTOP_LAYOUT_QUERY).matches) setIsMyReportsOpen(true)
    else { setIsMyReportsOpen(false); setMobileTab('account'); setMobileAccountView('reports') }
  }, [])
  useLayoutEffect(() => { groupRef.current = selectedCoordinateGroup }, [selectedCoordinateGroup])
  useEffect(() => { onMounted() }, [onMounted])

  const showLocationMessage = useCallback((message: string) => {
    window.clearTimeout(locationMessageTimerRef.current)
    setLocationMessage(message)
    locationMessageTimerRef.current = window.setTimeout(() => setLocationMessage(null), TRANSIENT_NOTICE_MS)
  }, [])
  const showMobileZoomGuide = useCallback(() => {
    window.clearTimeout(mobileZoomGuideTimerRef.current)
    setMobileZoomGuideKey(value => value === null ? 1 : value + 1)
    mobileZoomGuideTimerRef.current = window.setTimeout(() => setMobileZoomGuideKey(null), 2600)
  }, [])
  useEffect(() => () => window.clearTimeout(mobileZoomGuideTimerRef.current), [])
  useEffect(() => {
    if (!locationMessage) return
    const dismiss = () => {
      window.clearTimeout(locationMessageTimerRef.current)
      setLocationMessage(null)
    }
    document.addEventListener('pointerdown', dismiss, { once: true })
    document.addEventListener('keydown', dismiss, { once: true })
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss) }
  }, [locationMessage])

  const reviewPreview = useReviews(authProfile?.status === 'ACTIVE' && !authProfile.consentRequired ? authProfile.userId : null, {
    requireLogin: () => {
      if (isAuthLoading) { showLocationMessage('로그인 상태를 확인하고 있어요. 잠시 후 다시 눌러 주세요.'); return }
      if (authProfile?.consentRequired) { showLocationMessage('필수 약관 동의를 먼저 완료해 주세요.'); return }
      setLoginPurpose('review'); setIsLoginDialogOpen(true)
    },
    verifySession: async (isCurrent) => {
      const profile = await getCurrentUser()
      if (!isCurrent() || currentUserRef.current !== authProfile?.userId) return false
      setAuthProfile(profile)
      if (!profile) { setLoginPurpose('review'); setIsLoginDialogOpen(true) }
      else if (profile.userId !== authProfile?.userId) showLocationMessage('로그인 계정이 변경됐어요. 리뷰를 다시 눌러 주세요.')
      return Boolean(profile && profile.userId === authProfile?.userId && profile.status === 'ACTIVE' && !profile.consentRequired)
    },
  }, { embedded: !isDesktop, toiletId: expandedCoordinateToilet?.id ?? selectedToilet?.id, contextKey: `${selectedToilet?.id}:${expandedCoordinateToilet?.id}:${mobileTab}:${testToiletHash}`, onOpen: () => { if (!isDesktop) { setMobileTab('account'); setMobileAccountView('reviews') } }, onClose: () => setMobileAccountView('home') })

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_LAYOUT_QUERY)
    const updateViewport = () => setIsDesktop(mediaQuery.matches)
    updateViewport()
    mediaQuery.addEventListener('change', updateViewport)
    return () => mediaQuery.removeEventListener('change', updateViewport)
  }, [])

  const resumePendingLoginAction = useCallback(() => {
    if (new URLSearchParams(window.location.search).get('login') !== 'success') return
    trackEvent('login_result', { provider: 'unknown', success: true })

    const url = new URL(window.location.href)
    url.searchParams.delete('login')
    url.searchParams.delete('consent')
    window.history.replaceState(window.history.state, '', url)

    try {
      const pendingTab = window.sessionStorage.getItem(PENDING_MOBILE_TAB_KEY)
      window.sessionStorage.removeItem(PENDING_MOBILE_TAB_KEY)
      if (pendingTab === 'account' || pendingTab === 'notifications') setMobileTab(pendingTab)
      const openInbox = window.sessionStorage.getItem(PENDING_INBOX_KEY) === 'true'
      window.sessionStorage.removeItem(PENDING_INBOX_KEY)
      if (openInbox) { if (isDesktop) setIsNotificationsOpen(true); else setMobileTab('notifications'); return }
      const openMyReports = window.sessionStorage.getItem(PENDING_MY_REPORTS_KEY) === 'true'
      window.sessionStorage.removeItem(PENDING_MY_REPORTS_KEY)
      if (openMyReports) {
        showReportHistory()
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
  }, [isDesktop, showReportHistory])

  useEffect(() => {
    let active = true
    void getCurrentUser()
      .then((profile) => {
        if (!active) return
        warmOwnPhoto(profile?.profilePhoto)
        setAuthProfile(profile)
        if (profile && !profile.consentRequired) resumePendingLoginAction()
      })
      .catch(() => { if (active) setAuthProfile(null) })
      .finally(() => {
        if (!active) return
        setIsAuthLoading(false)
        const url = new URL(window.location.href)
        if (url.searchParams.get('login') === 'failed') {
          trackEvent('login_result', { provider: 'unknown', success: false })
          url.searchParams.delete('login')
          window.history.replaceState(window.history.state, '', url)
          showLocationMessage('로그인이 취소되었거나 완료되지 않았습니다. 다시 시도해 주세요.')
        }
      })
    return () => { active = false }
  }, [resumePendingLoginAction, showLocationMessage])

  const openReport = useCallback((target: ReportTarget) => {
    if (target.toilet.id < 0) return // Browser fixtures cannot enter the real report/auth-resume flow.
    trackEvent('report_start', { source: 'toilet_detail' })
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
    showReportHistory()
  }, [authProfile, showLocationMessage, showReportHistory])

  const handleSessionExpired = useCallback(() => {
    if (!currentUserRef.current) return
    currentUserRef.current = null
    try {
      window.sessionStorage.removeItem(PENDING_REPORT_TARGET_KEY)
      window.sessionStorage.removeItem(PENDING_MY_REPORTS_KEY)
      window.sessionStorage.removeItem(PENDING_INBOX_KEY)
      if (!isDesktop) window.sessionStorage.setItem(PENDING_MOBILE_TAB_KEY, mobileTab === 'map' ? 'notifications' : mobileTab)
      if (isNotificationsOpen) window.sessionStorage.setItem(PENDING_INBOX_KEY, 'true')
      else if (isMyReportsOpen || mobileAccountView === 'reports') window.sessionStorage.setItem(PENDING_MY_REPORTS_KEY, 'true')
    } catch { /* Login remains available when storage is disabled. */ }
    setAuthProfile(null); setUnreadNotificationCount(0); setFocusedReportId(null); setMobileAccountView('home')
    setIsMyReportsOpen(false); setIsNotificationsOpen(false); setIsAccountOpen(false); setReportTarget(null)
    showLocationMessage('로그인이 만료되었어요. 다시 로그인해 주세요.')
    if (isDesktop) { setLoginPurpose('general'); setIsLoginDialogOpen(true) }
    else if (mobileTab === 'map') setMobileTab('notifications')
  }, [isDesktop, mobileTab, mobileAccountView, isNotificationsOpen, isMyReportsOpen, showLocationMessage])

  const refreshNotificationCount = useCallback(() => {
    if (!authProfile) return
    const owner = authProfile.userId
    void fetchUnreadNotificationCount()
      .then(count => { if (currentUserRef.current === owner) setUnreadNotificationCount(count) })
      .catch(reason => { if (currentUserRef.current === owner && reason instanceof AuthExpiredError) handleSessionExpired() })
  }, [authProfile, handleSessionExpired])

  useEffect(() => {
    if (!authProfile) return
    refreshNotificationCount()
    const interval = window.setInterval(refreshNotificationCount, 60_000)
    return () => window.clearInterval(interval)
  }, [authProfile, refreshNotificationCount])

  const closeLoginDialog = useCallback(() => {
    try { window.sessionStorage.removeItem(PENDING_REPORT_TARGET_KEY) } catch { /* 저장소 사용 불가 환경 */ }
    try { window.sessionStorage.removeItem(PENDING_MY_REPORTS_KEY) } catch { /* 저장소 사용 불가 환경 */ }
    try { window.sessionStorage.removeItem(PENDING_INBOX_KEY) } catch { /* 저장소 사용 불가 환경 */ }
    setIsLoginDialogOpen(false)
  }, [])

  const handleLogout = useCallback(() => {
    void logout()
      .then(() => { setAuthProfile(null); setUnreadNotificationCount(0); setIsNotificationsOpen(false); setIsAccountOpen(false); setIsMyReportsOpen(false); setFocusedReportId(null) })
      .catch((logoutError: unknown) => showLocationMessage(logoutError instanceof Error ? logoutError.message : '로그아웃하지 못했습니다.'))
  }, [showLocationMessage])

  const handleConsentComplete = useCallback(() => {
    const signupUserId = authProfile?.status === 'PENDING_CONSENT' ? authProfile.userId : null
    setAuthProfile((profile) => profile ? { ...profile, status: 'ACTIVE', consentRequired: false } : profile)
    if (new URLSearchParams(window.location.search).get('returnTo') === 'admin') {
      window.location.assign('https://admin.geupddong.com')
      return
    }
    if (signupUserId) {
      void refreshSignupPhoto(getCurrentUser, (profile) => {
        if (currentUserRef.current !== signupUserId || profile.userId !== signupUserId) return false
        warmOwnPhoto(profile.profilePhoto)
        setAuthProfile(profile)
        return true
      })
    }
    showLocationMessage('약관 동의가 완료되었습니다.')
    resumePendingLoginAction()
  }, [authProfile, resumePendingLoginAction, showLocationMessage])

  const handleWithdrawn = useCallback((message: string) => {
    setIsAccountOpen(false)
    setAuthProfile(null)
    setUnreadNotificationCount(0)
    setIsMyReportsOpen(false)
    setIsNotificationsOpen(false)
    setWithdrawalNotice(message)
  }, [])

  const clearOverlays = useCallback(() => {
    overlaysRef.current.forEach((overlay) => overlay.setMap(null))
    overlaysRef.current = []
    toiletMarkerElementsRef.current.clear()
  }, [])

  const markerGesture = useMemo(() => createMarkerTapGesture(), [])
  useEffect(() => {
    // Observe gestures without consuming them: the SDK must receive the original
    // down/move/up sequence when a drag begins on a custom marker.
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) { markerGesture.cancel(); return }
      if (event.target instanceof Element && event.target.closest('.toilet-marker,.coordinate-group-marker,.cluster-marker')) {
        markerGesture.start(event)
        markerClickUntilRef.current = Date.now() + 750
      } else markerGesture.cancel()
    }
    const move = (event: PointerEvent) => markerGesture.move(event)
    const up = (event: PointerEvent) => markerGesture.end(event)
    const cancel = () => markerGesture.cancel()
    document.addEventListener('pointerdown', down, { capture: true, passive: true })
    document.addEventListener('pointermove', move, { capture: true, passive: true })
    document.addEventListener('pointerup', up, { capture: true, passive: true })
    document.addEventListener('pointercancel', cancel, { capture: true, passive: true })
    window.addEventListener('blur', cancel)
    return () => {
      document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointermove', move, true)
      document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('blur', cancel); markerGesture.cancel()
    }
  }, [markerGesture])
  const suppressMapClickFromMarker = useCallback((event: MouseEvent) => {
    event.stopPropagation()
    preventMapEvent(mapRef.current)
    markerClickUntilRef.current = Date.now() + 750
    return markerGesture.acceptsClick(event.detail)
  }, [markerGesture])

  const updateReferencePoint = useCallback((coordinates: Coordinates, source: DistanceSource = 'point') => {
    const map = mapRef.current
    if (!map) return

    referenceRequestGate.invalidate()
    setIsLocating(false)
    setMapCenter(coordinates)
    setDistanceSource(source)
    referencePointOverlayRef.current?.setMap(null)
    referencePointOverlayRef.current = null
    searchLocationOverlayRef.current?.setMap(null)
    searchLocationOverlayRef.current = null
    // GPS already has the blue current-location marker; do not stack a red pin on it.
    if (source === 'current-location') return
    const content = document.createElement('div')
    content.className = 'map-reference-marker'
    content.dataset.mapLabel = 'reference'
    content.innerHTML = '<span class="map-reference-marker-pin" aria-hidden="true"><span></span></span><span class="map-reference-marker-label">기준점</span>'
    referencePointOverlayRef.current = createMapOverlay(map, {
      position: createMapCoordinate(map, coordinates.latitude, coordinates.longitude),
      content,
      yAnchor: 1,
      zIndex: 4,
    })
    referencePointOverlayRef.current.setMap(map)
    localizeMapLabels(mapContainerRef.current, mapLocale.current)
  }, [referenceRequestGate])

  const positionPlaceCardAtToilet = useCallback((toilet: SelectedToilet, cardHeight: number) => {
    const container = mapContainerRef.current
    const map = mapRef.current
    if (!container || !map || !window.matchMedia(DESKTOP_LAYOUT_QUERY).matches) return

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
          const projected = map.getProjection().pointFromCoords(createMapCoordinate(map, toilet.latitude, toilet.longitude))
          return { x: projected.x + container.offsetLeft, y: projected.y + container.offsetTop }
        })()
    const mapBounds = {
      left: containerRect.left - sectionRect.left + MAP_EDGE_GAP,
      top: containerRect.top - sectionRect.top + MAP_EDGE_GAP,
      right: containerRect.right - sectionRect.left - MAP_EDGE_GAP,
      bottom: containerRect.bottom - sectionRect.top - MAP_EDGE_GAP,
    }
    const cardWidth = placeCardRef.current?.offsetWidth ?? Math.min(PLACE_CARD_WIDTH, mapBounds.right - mapBounds.left)
    const { left, top } = cardPlacement(mapBounds, point, cardWidth, cardHeight, markerRect?.height ?? 34)
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
    toiletMarkerElementsRef.current.forEach((marker) => marker.classList.remove('is-selected'))
  }, [])

  const closeDetailCard = useCallback(() => {
    preserveGroupOnHomeRef.current = false
    setIsMobileAreaListOpen(false)
    resetDetailCard()
    onNavigate(null)
  }, [onNavigate, resetDetailCard])

  useLayoutEffect(() => { pendingNavigationPath.current = undefined }, [route.path])

  useEffect(() => {
    if (!isMapReady) return
    const save = (path: string | null, expanded = isMobileCardExpanded) => {
      try {
        if (!path) { window.sessionStorage.removeItem(MAP_RESUME_KEY); return }
        const map = mapRef.current
        if (!map) return
        const center = map.getCenter()
        saveMapResume(window.sessionStorage, { path,
          center: { latitude: center.getLat(), longitude: center.getLng() }, level: map.getLevel(),
          reference: mapCenter, source: distanceSource, currentLocation, expanded, savedAt: Date.now() })
      } catch { /* Navigation works even when session storage is unavailable. */ }
    }
    const beforeNavigation = (event: Event) => {
      const path = (event as CustomEvent<string | null>).detail
      pendingNavigationPath.current = path
      // A newly selected card is collapsed, even if the previous card was expanded.
      save(path, false)
    }
    const beforePageHide = () => save(pendingNavigationPath.current === undefined
      ? mapNavigationPath(window.location.href, window.location.origin) : pendingNavigationPath.current,
      pendingNavigationPath.current === undefined ? isMobileCardExpanded : false)
    window.addEventListener(MAP_NAVIGATION_EVENT, beforeNavigation)
    window.addEventListener('pagehide', beforePageHide)
    return () => {
      window.removeEventListener(MAP_NAVIGATION_EVENT, beforeNavigation)
      window.removeEventListener('pagehide', beforePageHide)
    }
  }, [isMapReady, mapCenter, distanceSource, currentLocation, isMobileCardExpanded])

  useEffect(() => {
    const languageOnly = isLanguageOnlyNavigation(previousRoutePath.current, route.path)
    previousRoutePath.current = route.path
    if (languageOnly) return // Keep open groups, selected cards, list scroll and map viewport.
    const detail = route.detail ? detailCache.get(route.detail.id) ?? route.detail : null
    if (!detail) {
      if (testToilet && selectedToiletRef.current?.id === testToilet.id) return
      if (preserveGroupOnHomeRef.current) {
        preserveGroupOnHomeRef.current = false
        setToiletDetail(null)
        setExpandedCoordinateToilet(null)
        setIsDetailLoading(false)
      } else resetDetailCard()
      // Returning home clears the detail, not an area list just opened by the user.
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
        if (list && item) scrollCoordinateGroupItem(list, item)
      })
      return () => window.cancelAnimationFrame(frame)
    }
  }, [route, resetDetailCard, detailCache, testToilet])

  useEffect(() => {
    const keyword = placeSearchKeyword.trim()
    const requestSequence = ++placeSearchRequestRef.current
    const controller = new AbortController()

    if (keyword.length < 2) {
      return
    }

    const timer = window.setTimeout(async () => {
      setIsPlaceSearching(true)
      setPlaceSearchMessage(null)
      try {
        const places = await searchPlaces(keyword, locale, controller.signal)
        if (requestSequence !== placeSearchRequestRef.current) return
        setPlaceSearchResults(places)
        setPlaceSearchMessage(places.length === 0 ? '검색 결과가 없습니다.' : null)
        trackEvent('toilet_search', {
          query_kind: /\d|로|길/.test(keyword) ? 'address' : 'place',
          success: true,
          result_count_bucket: resultCountBucket(places.length),
        })
      } catch {
        if (controller.signal.aborted) return
        if (requestSequence === placeSearchRequestRef.current) {
          setPlaceSearchResults([])
          setPlaceSearchMessage('장소를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.')
          trackEvent('toilet_search', { query_kind: 'unknown', success: false, result_count_bucket: '0' })
        }
      } finally {
        if (requestSequence === placeSearchRequestRef.current) setIsPlaceSearching(false)
      }
    }, 300)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [placeSearchKeyword, locale])

  useLayoutEffect(() => {
    if (!isMapReady || !selectedToilet || !placeCardRef.current) return
    // Synchronous layout measurement: no first frame at the fallback position.
    const position = () => {
      if (placeCardRef.current) positionPlaceCardAtToilet(selectedToilet, placeCardRef.current.offsetHeight)
    }
    position()
    const observer = new ResizeObserver(position)
    if (mapContainerRef.current) observer.observe(mapContainerRef.current)
    observer.observe(placeCardRef.current)
    return () => observer.disconnect()
  }, [isMapReady, isDesktop, selectedToilet, toiletDetail, isDetailLoading, detailError, positionPlaceCardAtToilet])

  const positionSelectedCard = useCallback(() => {
    if (selectedToiletRef.current && placeCardRef.current) {
      positionPlaceCardAtToilet(selectedToiletRef.current, placeCardRef.current.offsetHeight)
    }
  }, [positionPlaceCardAtToilet])

  const selectToilet = useCallback((toiletId: number, name: string, latitude: number, longitude: number, keepCoordinateGroup = false, toiletType?: string) => {
    const zoom = mapRef.current?.getLevel() ?? 7
    const source = keepCoordinateGroup ? 'coordinate_group' : 'map'
    trackEvent('toilet_marker_select', { source, zoom_bucket: zoom <= 3 ? 'near' : zoom <= 6 ? 'mid' : 'far' })
    trackEvent('toilet_detail_open', { source })
    setIsMobileAreaListOpen(false)
    const selected = { id: toiletId, name, latitude, longitude, toiletType }
    selectedToiletRef.current = selected
    setExpandedCoordinateToilet(null)
    if (!keepCoordinateGroup || !window.matchMedia(DESKTOP_LAYOUT_QUERY).matches) setSelectedCoordinateGroup(null)
    toiletMarkerElementsRef.current.forEach((marker, markerId) => marker.classList.toggle('is-selected', markerId === toiletId))
    setSelectedToilet(selected)
    setPlaceCardPosition(null)
    setIsMobileCardExpanded(false)
    const cached = toiletId === testToilet?.id ? testToilet : detailCache.get(toiletId)
    setToiletDetail(cached)
    setDetailError(null)
    setIsDetailLoading(!cached)
    if (toiletId === testToilet?.id) onNavigate(null)
    else onNavigate(toiletId)
  }, [onNavigate, detailCache, testToilet])

  useEffect(() => {
    const map = mapRef.current
    const point = toiletCoordinates(testToilet)
    if (!isMapReady || !map || !testToilet || !point) return
    // Separate overlay: never mix this item into API lists, totals, caches or clusters.
    const content = document.createElement('button')
    content.type = 'button'
    content.className = `toilet-marker review-test-marker${selectedToilet?.id === testToilet.id ? ' is-selected' : ''}`
    content.setAttribute('aria-label', message(locale, 'map.reviewTestAria', { name: testToilet.name }))
    const pin = document.createElement('span')
    pin.className = 'toilet-marker-pin'
    const logo = document.createElement('img')
    logo.src = toiletMarkerLogo
    logo.className = 'toilet-marker-logo'
    logo.alt = ''
    pin.append(logo)
    const name = document.createElement('span')
    name.className = 'toilet-marker-name'
    name.textContent = message(locale, 'map.reviewTestMarker')
    content.append(pin, name)
    content.addEventListener('click', event => {
      if (!suppressMapClickFromMarker(event)) return
      selectToilet(testToilet.id, testToilet.name, point.latitude, point.longitude, false, testToilet.toiletType)
    })
    const overlay = createMapOverlay(map, {
      position: createMapCoordinate(map, point.latitude, point.longitude), content,
      yAnchor: 1, zIndex: 4, clickable: false,
    })
    overlay.setMap(map)
    return () => overlay.setMap(null)
  }, [isMapReady, testToilet, selectToilet, selectedToilet?.id, suppressMapClickFromMarker, locale])

  const openCoordinateGroup = useCallback((point: MapPoint) => {
    if (!point.toilets) return
    setIsMobileAreaListOpen(false)
    resetDetailCard()
    preserveGroupOnHomeRef.current = true
    onNavigate(null)
    setSelectedCoordinateGroup({ latitude: point.latitude, longitude: point.longitude, toilets: sortCoordinateGroupToilets(point.toilets), displayGroupName: point.displayGroupName })
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
    const cached = detailCache.get(toilet.id)
    setToiletDetail(cached)
    setDetailError(null)
    setIsDetailLoading(!cached)
    onNavigate(toilet.id)

    const scrollExpandedItemIntoView = () => {
      const list = coordinateGroupListRef.current
      const item = coordinateGroupItemRefs.current.get(toilet.id)
      if (!list || !item) return

      scrollCoordinateGroupItem(list, item, 'smooth')
    }

    requestAnimationFrame(scrollExpandedItemIntoView)

  }, [expandedCoordinateToilet, onNavigate, detailCache])

  useEffect(() => {
    const selected = selectedToilet ?? expandedCoordinateToilet
    const displaySelected = selected ? localizeToiletMapItem(selected, locale) : null
    const map = mapRef.current
    if (!isMapReady || !displaySelected || displaySelected.id === testToilet?.id || !map || toiletMarkerElementsRef.current.has(displaySelected.id)) return
    // A directly linked toilet can be absent from the current clustered/bounds response.
    // Show its real coordinate without moving the map or requesting the list again.
    const content = document.createElement('button')
    content.type = 'button'
    content.className = 'toilet-marker is-selected'
    content.setAttribute('aria-label', displaySelected.name)
    const pin = document.createElement('span')
    pin.className = 'toilet-marker-pin'
    const logo = document.createElement('img')
    logo.className = 'toilet-marker-logo'
    logo.src = toiletMarkerLogo
    logo.alt = ''
    pin.append(logo)
    content.append(pin)
    content.addEventListener('click', suppressMapClickFromMarker)
    const overlay = createMapOverlay(map, {
      position: createMapCoordinate(map, displaySelected.latitude, displaySelected.longitude), content, yAnchor: 1, zIndex: 3,
      clickable: false,
    })
    overlay.setMap(map)
    return () => overlay.setMap(null)
  }, [selectedToilet, expandedCoordinateToilet, result, isMapReady, locale, suppressMapClickFromMarker, testToilet])

  const renderResult = useCallback((map: MapInstance, response: ToiletMapSearchResponse) => {
    clearOverlays()
    const displayResponse = localizeToiletMapSearch(response, mapLocale.current)

    const points: MapPoint[] = displayResponse.meta.display_type === 'CLUSTER'
      ? displayResponse.clusters
      : groupToiletsByCoordinate(displayResponse.toilets, mapLocale.current)
    const displayPoints = map.getLevel() >= 5 || displayResponse.meta.display_type === 'CLUSTER'
      ? groupPointsByScreenGrid(map, points)
      : points

    const shouldShowToiletName = map.getLevel() <= 4 && displayResponse.meta.display_type !== 'CLUSTER'

    overlaysRef.current = displayPoints.map((point) => {
      if (point.count > 1) {
        const content = document.createElement('button')
        const isCoordinateGroup = point.toilets != null
        const isNamedCoordinateGroup = isCoordinateGroup && Boolean(point.displayGroupName)
        content.className = isNamedCoordinateGroup
          ? 'toilet-marker coordinate-display-group-marker'
          : isCoordinateGroup ? 'coordinate-group-marker' : 'cluster-marker'
        content.type = 'button'
        if (isNamedCoordinateGroup) {
          const pin = document.createElement('span')
          pin.className = 'toilet-marker-pin'
          pin.setAttribute('aria-hidden', 'true')
          const logo = document.createElement('img')
          logo.className = 'toilet-marker-logo'
          logo.src = toiletMarkerLogo
          logo.alt = ''
          pin.append(logo)
          const name = document.createElement('span')
          name.className = 'toilet-marker-name'
          name.textContent = point.displayGroupName ?? ''
          content.append(pin, name)
        } else {
          content.textContent = isCoordinateGroup ? `${message(mapLocale.current, 'map.sameLocation')} ${point.count}` : String(point.count)
        }
        content.dataset.mapLabel = isCoordinateGroup ? 'group' : 'cluster'
        content.dataset.mapCount = String(point.count)
        content.dataset.mapName = point.displayGroupName || ''
        content.setAttribute('aria-label', isCoordinateGroup
          ? message(mapLocale.current, 'map.groupMarker', { name: point.displayGroupName || message(mapLocale.current, 'map.sameLocation'), count: point.count })
          : message(mapLocale.current, 'map.clusterMarker', { count: point.count }))
        content.addEventListener('click', (event) => {
          if (!suppressMapClickFromMarker(event)) return
          if (isCoordinateGroup) {
            openCoordinateGroup(point)
            return
          }
          const position = createMapCoordinate(map, point.latitude, point.longitude)
          map.setLevel(Math.max(1, map.getLevel() - 2), { anchor: position })
          map.panTo(position)
        })

        return createMapOverlay(map, {
          position: createMapCoordinate(map, point.latitude, point.longitude),
          content,
          yAnchor: isNamedCoordinateGroup ? 1 : 0.5,
          zIndex: 2,
          clickable: false,
        })
      }

      const content = document.createElement('button')
      content.className = 'toilet-marker'
      content.type = 'button'
      const toiletName = point.name ?? message(mapLocale.current, 'map.unnamed')
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
      content.addEventListener('click', (event) => {
        if (!suppressMapClickFromMarker(event)) return
        if (point.id != null) void selectToilet(point.id, toiletName, point.latitude, point.longitude, false, point.toiletType)
      })

      return createMapOverlay(map, {
        position: createMapCoordinate(map, point.latitude, point.longitude),
        content,
        yAnchor: 1,
        zIndex: 1,
        clickable: false,
      })
    })

    overlaysRef.current.forEach((overlay) => overlay.setMap(map))
    localizeMapLabels(mapContainerRef.current, mapLocale.current)
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
        includeList: window.matchMedia(DESKTOP_LAYOUT_QUERY).matches && map.getLevel() <= MAX_LIST_ZOOM_LEVEL,
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
    const position = createMapCoordinate(map, coordinates.latitude, coordinates.longitude)
    currentLocationOverlayRef.current?.setMap(null)

    const content = document.createElement('div')
    content.className = 'current-location-marker'
    content.dataset.mapLabel = 'current'
    content.innerHTML = '<span aria-hidden="true"></span><span class="sr-only">현재 위치</span>'
    currentLocationOverlayRef.current = createMapOverlay(map, {
      position,
      content,
      yAnchor: 0.5,
      zIndex: 3,
    })
    currentLocationOverlayRef.current.setMap(map)
    localizeMapLabels(mapContainerRef.current, mapLocale.current)

    if (shouldCenterMap) {
      updateReferencePoint(coordinates, 'current-location')
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
    const request = referenceRequestGate.begin()
    const isCurrent = () => referenceRequestGate.isCurrent(request) && mapRef.current === map

    if (!navigator.geolocation) {
      if (!isInitialRequest) trackEvent('nearby_search', { permission_state: 'unsupported', success: false })
      if (!isInitialRequest) showLocationMessage('이 브라우저에서는 현재 위치를 지원하지 않습니다.')
      setIsLocating(false)
      return
    }

    if (!isInitialRequest) setIsLocating(true)
    try {
      if ('permissions' in navigator) {
        const permission = await navigator.permissions.query({ name: 'geolocation' })
        if (!isCurrent()) return
        if (permission.state === 'denied') {
          if (!isInitialRequest) trackEvent('nearby_search', { permission_state: 'denied', success: false })
          if (!isInitialRequest) showLocationMessage('위치 권한이 거부되었습니다. 브라우저의 사이트 설정에서 위치를 허용해 주세요.')
          setIsLocating(false)
          return
        }
      }
    } catch {
      // Permissions API를 지원하지 않는 브라우저는 Geolocation 요청으로 바로 진행한다.
    }

    if (!isCurrent()) return
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!isCurrent()) return
        updateCurrentLocation({ latitude: coords.latitude, longitude: coords.longitude }, true)
        if (!isInitialRequest) trackEvent('nearby_search', { permission_state: 'granted', success: true })
        startCurrentLocationWatch()
        window.clearTimeout(locationMessageTimerRef.current)
        setLocationMessage(null)
        setIsLocating(false)
      },
      (positionError) => {
        if (!isCurrent()) return
        const messageByCode: Record<number, string> = {
          1: '위치 권한이 거부되었습니다. 브라우저 주소창의 위치 권한을 허용한 뒤 다시 시도해 주세요.',
          2: '현재 위치를 확인할 수 없습니다. GPS·Wi‑Fi 연결을 확인해 주세요.',
          3: '위치 확인 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
        }
        if (!isInitialRequest) showLocationMessage(messageByCode[positionError.code] ?? '현재 위치를 확인하지 못했습니다.')
        if (!isInitialRequest) trackEvent('nearby_search', {
          permission_state: positionError.code === 1 ? 'denied' : 'unavailable',
          success: false,
        })
        setIsLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    )
  }, [showLocationMessage, startCurrentLocationWatch, updateCurrentLocation, referenceRequestGate])

  const moveToSearchPlace = useCallback((place: PlaceSearchResult) => {
    const map = mapRef.current
    if (!map) return

    const selectedRank = placeSearchResults.findIndex((candidate) => candidate.id === place.id)
    trackEvent('search_result_select', {
      rank_bucket: selectedRank <= 0 ? 'first' : selectedRank <= 2 ? 'top3' : 'other',
    })

    closeDetailCard()
    const position = createMapCoordinate(map, place.latitude, place.longitude)
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
    searchLocationOverlayRef.current = createMapOverlay(map, {
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
  }, [closeDetailCard, placeSearchResults, updateReferencePoint])

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
    const removeMapListeners: Array<() => void> = []
    const container = mapContainerRef.current
    if (!container) return

    async function initialize() {
      if (!container) return

      try {
        const snapshot = mapSwitchSnapshotRef.current
        const center = snapshot?.center ?? resume?.center ?? toiletCoordinates(initialRouteRef.current.detail) ?? toiletCoordinates(testToilet) ?? DAEJEON_CITY_HALL
        const level = snapshot?.level ?? resume?.level ?? (initialRouteRef.current.detail || testToilet ? 4 : 6)
        const map = await createMap(container, center, level, mapLocale.current, controller.signal)
        if (disposed) return
        mapRef.current = map
        mapSwitchSnapshotRef.current = null
        setIsMapReady(true)
        setMapZoomLevel(map.getLevel())
        updateReferencePoint(snapshot?.reference ?? resume?.reference ?? center, snapshot?.source ?? resume?.source ?? 'point')
        if (snapshot?.currentLocation) updateCurrentLocation(snapshot.currentLocation, false)
        if (resume) {
          if (!snapshot?.currentLocation && resume.currentLocation) updateCurrentLocation(resume.currentLocation, false)
          setIsMobileCardExpanded(resume.expanded)
          try { window.sessionStorage.removeItem(MAP_RESUME_KEY) } catch { /* Storage may be unavailable. */ }
        }
        // Save before a DOM resize: SDK getCenter() may already reflect the new element size.
        let settledViewportCenter = map.getCenter()
        removeMapListeners.push(addMapEventListener(map, 'idle', () => {
          if (disposed) return
          settledViewportCenter = map.getCenter()
          if (mapInteractionRef.current) {
            mapInteractionRef.current = false
            setIsMobileAreaListOpen(false)
            if (window.matchMedia(DESKTOP_LAYOUT_QUERY).matches) closeDetailCard()
          }
          scheduleMapAreaLoad()
          positionSelectedCard()
        }))
        const markMapInteraction = () => {
          if (disposed) return
          mapInteractionRef.current = true
          setIsMobileAreaListOpen(false)
          window.clearTimeout(mobileZoomGuideTimerRef.current)
          setMobileZoomGuideKey(null)
        }
        removeMapListeners.push(addMapEventListener(map, 'dragstart', markMapInteraction))
        removeMapListeners.push(addMapEventListener(map, 'zoom_changed', markMapInteraction))
        removeMapListeners.push(addMapEventListener(map, 'zoom_changed', () => { if (!disposed) setMapZoomLevel(map.getLevel()) }))
        removeMapListeners.push(addMapEventListener(map, 'click', (event) => {
          if (disposed) return
          setIsMobileAreaListOpen(false)
          if (Date.now() < markerClickUntilRef.current) return
          if (window.matchMedia(DESKTOP_LAYOUT_QUERY).matches && event?.latLng) {
            updateReferencePoint({ latitude: event.latLng.getLat(), longitude: event.latLng.getLng() })
            map.panTo(event.latLng)
          }
        }))
        resizeObserver = new ResizeObserver(() => { if (!disposed) relayoutPreservingCenter(map, settledViewportCenter) })
        resizeObserver.observe(container)
        await loadMapArea()
        if (snapshot) window.requestAnimationFrame(() => { if (!disposed) setIsMapSwitching(false) })
        if (!disposed && !snapshot && !initialRouteRef.current.detail && !resume && !testToilet) void moveToCurrentLocation(true)
        if (!disposed && resume?.source === 'current-location') startCurrentLocationWatch()
      } catch (caughtError) {
        if (disposed) return
        // Browser Back/Forward can bypass the language menu. Recover the same
        // viewport and detail route before loading the SDK in the new language.
        if (caughtError instanceof NaverMapLanguageReloadRequired) {
          const snapshot = mapSwitchSnapshotRef.current
          const live = liveMapStateRef.current
          try {
            saveMapResume(window.sessionStorage, {
              path: window.location.pathname,
              center: snapshot?.center ?? resume?.center ?? live.mapCenter,
              level: snapshot?.level ?? resume?.level ?? 6,
              reference: snapshot?.reference ?? resume?.reference ?? live.mapCenter,
              source: snapshot?.source ?? resume?.source ?? live.distanceSource,
              currentLocation: snapshot ? snapshot.currentLocation : resume?.currentLocation ?? live.currentLocation,
              expanded: isMobileCardExpandedRef.current,
              savedAt: Date.now(),
            })
          } catch { /* Map navigation still works without session storage. */ }
          window.location.reload()
          return
        }
        setIsLoading(false)
        setIsMapSwitching(false)
        setError(caughtError instanceof Error ? caughtError.message : '지도를 불러오지 못했습니다.')
      }
    }

    void initialize()
    return () => {
      disposed = true
      controller.abort()
      referenceRequestGate.invalidate()
      requestSequenceRef.current += 1
      const activeMap = mapRef.current
      if (activeMap) {
        const center = activeMap.getCenter()
        const live = liveMapStateRef.current
        setIsMapSwitching(true)
        mapSwitchSnapshotRef.current = {
          center: { latitude: center.getLat(), longitude: center.getLng() },
          level: activeMap.getLevel(),
          reference: live.mapCenter,
          source: live.distanceSource,
          currentLocation: live.currentLocation,
        }
      }
      mapRef.current = null
      setIsMapReady(false)
      removeMapListeners.forEach(remove => remove())
      clearOverlays()
      currentLocationOverlayRef.current?.setMap(null)
      searchLocationOverlayRef.current?.setMap(null)
      referencePointOverlayRef.current?.setMap(null)
      if (locationWatchIdRef.current != null) {
        navigator.geolocation?.clearWatch(locationWatchIdRef.current)
        locationWatchIdRef.current = null
      }
      resizeObserver?.disconnect()
      if (activeMap) destroyMap(activeMap)
      // The SDK owns this empty React div. Remove its DOM when dev HMR/Strict Mode disposes it.
      container.replaceChildren()
      window.clearTimeout(mapLoadTimerRef.current)
      window.clearTimeout(locationMessageTimerRef.current)
    }
  }, [clearOverlays, closeDetailCard, loadMapArea, moveToCurrentLocation, positionSelectedCard, scheduleMapAreaLoad, updateReferencePoint, resume, updateCurrentLocation, startCurrentLocationWatch, referenceRequestGate, testToilet, mapRuntimeKey])

  const distanceReference = resolveDistanceReference(distanceSource, mapCenter, currentLocation)
  const displaySelectedToilet = selectedToilet ? localizeToiletMapItem(selectedToilet, locale) : null
  const displayToiletDetail = toiletDetail ? localizeToiletDetail(toiletDetail, locale) : null
  const displaySelectedCoordinateGroup = useMemo(() => {
    if (!selectedCoordinateGroup) return null
    const toilets = selectedCoordinateGroup.toilets.map(toilet => localizeToiletMapItem(toilet, locale))
    const [localizedGroup] = groupToiletsByCoordinate(toilets, locale)
    return { ...selectedCoordinateGroup, toilets, displayGroupName: localizedGroup?.displayGroupName }
  }, [locale, selectedCoordinateGroup])
  const distanceReferenceLabel = t(distanceSource === 'current-location' ? 'map.fromMe' : 'map.distanceFrom')
  const distanceToSelectedToilet = distanceReference && selectedToilet
    ? formatDistance(calculateDistanceInMeters(distanceReference, selectedToilet))
    : null
  const distanceToCoordinateGroup = distanceReference && selectedCoordinateGroup
    ? formatDistance(calculateDistanceInMeters(distanceReference, selectedCoordinateGroup))
    : null
  const hasMapCard = selectedToilet != null || selectedCoordinateGroup != null
  const isListZoomLimited = mapZoomLevel > MAX_LIST_ZOOM_LEVEL
  const areaToilets = useMemo(
    () => (isListZoomLimited ? [] : mobileAreaToilets ?? result?.toilets ?? [])
      .map(toilet => localizeToiletMapItem(toilet, locale)),
    [isListZoomLimited, locale, mobileAreaToilets, result?.toilets],
  )
  const groupedAreaToilets = useMemo(() => groupToiletsByCoordinate(areaToilets, locale), [areaToilets, locale])
  const sortedAreaToiletGroups = distanceReference
    ? [...groupedAreaToilets].sort((left, right) => calculateDistanceInMeters(distanceReference, left) - calculateDistanceInMeters(distanceReference, right))
    : groupedAreaToilets

  const toggleMobileAreaList = useCallback(async () => {
    if (isMobileAreaListVisible) {
      setIsMobileAreaListOpen(false)
      return
    }

    const map = mapRef.current
    if (!map || !result) return

    closeDetailCard()
    if (map.getLevel() > MAX_LIST_ZOOM_LEVEL) {
      showMobileZoomGuide()
      return
    }
    setIsMobileAreaListOpen(true)
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
  }, [closeDetailCard, isMobileAreaListVisible, result, showMobileZoomGuide])

  const selectMobileAreaToilet = useCallback((toilet: ToiletMapItem) => {
    const map = mapRef.current
    if (!map) return

    const selectedGroup = groupedAreaToilets.find((group) => group.id === toilet.id || group.toilets?.some((item) => item.id === toilet.id))
    const position = createMapCoordinate(map, toilet.latitude, toilet.longitude)
    setIsMobileAreaListOpen(false)
    if (selectedGroup?.toilets) {
      openCoordinateGroup(selectedGroup)
    } else {
      void selectToilet(toilet.id, toilet.name, toilet.latitude, toilet.longitude, false, toilet.toiletType)
    }
    if (!window.matchMedia(DESKTOP_LAYOUT_QUERY).matches) map.panTo(position)
  }, [groupedAreaToilets, openCoordinateGroup, selectToilet])

  return (
    <main data-review-design-preview={REVIEW_DESIGN_PREVIEW || undefined} data-review-api={REVIEW_API_ENABLED || undefined} className={`app-shell${!isDesktop ? ' has-mobile-navigation' : ''}${!isDesktop && mobileTab !== 'map' ? ' is-mobile-page' : ''}`}>
      <AppUpdateNotice blocked={Boolean(reviewPreview.active || reportTarget || isLoginDialogOpen || isAccountOpen || isMyReportsOpen || isNotificationsOpen || mobileTab !== 'map' || placeSearchKeyword || selectedCoordinateGroup || isMobileAreaListVisible || authProfile?.consentRequired)}
        beforeReload={() => {
          const map = mapRef.current
          if (!map) return false
          // Do not reload while URL navigation is still catching up with the selected card.
          const expectedPath = localizedPublicPath(selectedToilet ? `/toilet/${selectedToilet.id}` : '/', locale)!
          if (window.location.pathname !== expectedPath || route.path !== expectedPath) return false
          const center = map.getCenter()
          try {
            return saveMapResume(window.sessionStorage, {
              path: expectedPath, center: { latitude: center.getLat(), longitude: center.getLng() }, level: map.getLevel(),
              reference: mapCenter, source: distanceSource, currentLocation, expanded: isMobileCardExpanded, savedAt: Date.now(),
            })
          } catch { return false }
        }} />
      <header className="topbar">
        <div className="topbar-inner">
        <a className="brand" href={localizedPublicPath('/', locale)!} aria-label={t('map.home')}><BrandWordmark locale={locale} /></a>
        <span className="subtitle">{t('map.subtitle')}</span>
        <div className="place-search">
          <label className="sr-only" htmlFor="place-search-input">{t('map.search')}</label>
          <input
            ref={placeSearchInputRef}
            id="place-search-input"
            className="place-search-input"
            type="search"
            value={placeSearchKeyword}
            placeholder={isDesktop ? t('map.search') : t('map.searchShort')}
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
          {isPlaceSearchResultsOpen && <div id="place-search-results" className="place-search-results" role="listbox" aria-label={t('map.results')}>
            {isPlaceSearching && <p className="place-search-status">{t('map.searching')}</p>}
            {!isPlaceSearching && placeSearchMessage && <p className="place-search-status">{mapSystemNotice(placeSearchMessage, locale)}</p>}
            {!isPlaceSearching && placeSearchResults.map((place, index) => <button
              id={`place-search-result-${place.id}`}
              key={place.id}
              type="button"
              role="option"
              aria-selected={activePlaceSearchIndex === index}
              className={activePlaceSearchIndex === index ? 'is-active' : ''}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => moveToSearchPlace(place)}
            ><strong>{place.name}</strong><span className="place-search-result-detail"><small>{place.category || t('map.place')}</small><span>{place.address || t('map.noAddress')}</span></span></button>)}
          </div>}
        </div>
        {isDesktop && <nav className="desktop-primary-nav" aria-label={t('nav.main')}><Link href={localizedPublicPath('/', locale)!} aria-current="page">{t('nav.map')}</Link><Link href={localizedPublicPath('/regions', locale)!}>{t('nav.community')}</Link></nav>}
        {!isDesktop && <div className="mobile-header-actions">
          {!isAuthLoading && !authProfile && <button type="button" className="auth-button" onClick={() => setMobileTab('account')}>{t('auth.login')}</button>}
          {ENGLISH_UI_ENABLED && <LanguageSelector locale={locale} onSelect={next => onLocaleChange(next, testToilet ? null : selectedToilet?.id ?? expandedCoordinateToilet?.id ?? null)} />}
        </div>}
        {isDesktop && <div className="desktop-header-actions">
          <button type="button" className="notification-button" onClick={() => { if (authProfile) setIsNotificationsOpen(true); else { setLoginPurpose('general'); setIsLoginDialogOpen(true) } }} aria-label={unreadNotificationCount ? t('map.unread', { count: unreadNotificationCount }) : t('nav.notifications')}><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-2.5 7-2.5 9h17C20.5 15 18 15 18 8ZM10 21h4" /></svg>{unreadNotificationCount > 0 && <strong>{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</strong>}</button>
          {isAuthLoading ? <span className="auth-status">{t('map.checking')}</span> : authProfile ? <ProfileMenu profile={authProfile} onLogout={handleLogout} /> : <button type="button" className="header-account-button" onClick={() => { setLoginPurpose('general'); setIsLoginDialogOpen(true) }}>{t('auth.login')}</button>}
          {ENGLISH_UI_ENABLED && <LanguageSelector locale={locale} onSelect={next => onLocaleChange(next, testToilet ? null : selectedToilet?.id ?? expandedCoordinateToilet?.id ?? null)} />}
        </div>}
        </div>
      </header>

      <section className="map-section" aria-label={t('map.title')}>
        <div className="map-stage" inert={!isDesktop && mobileTab !== 'map'} style={!isDesktop && mobileTab !== 'map' ? { visibility: 'hidden' } : undefined}>
        <div ref={mapContainerRef} className="map" />
        <div className={`map-provider-transition${isMapSwitching ? ' is-visible' : ''}`} role={isMapSwitching ? 'status' : undefined} aria-hidden={!isMapSwitching}>
          <span className="map-provider-transition-spinner" aria-hidden="true" />
          <span>{t('map.switching')}</span>
        </div>
        {error && result && <div className="connection-status-banner" role="alert">
          <span className="connection-status-dot" aria-hidden="true" />
          <div>
            <strong>{t('map.connectionLost')}</strong>
            <span>{t('map.updated', { time: formatLastUpdatedAt(lastSuccessfulMapUpdate, locale) })}</span>
          </div>
          <button type="button" onClick={() => void loadMapArea()} disabled={isLoading}>{t(isLoading ? 'map.reconnecting' : 'map.reconnect')}</button>
        </div>}
        <p className="desktop-map-reference-hint">{t('map.referenceHint')}</p>
        <div className={`map-controls${hasMapCard ? ' is-with-card' : ''}`}>
          <div className="map-hud" aria-live="polite">
            {isLoading && <span className="map-loading-message">{t('map.loading')}</span>}
            {!isLoading && result && <span className="map-area-count">{t('map.area', { count: result.meta.total_count.toLocaleString(locale) })}{result.meta.display_type === 'CLUSTER' ? t('map.clustered') : ''}</span>}
            {result && <button className={`mobile-area-list-button${isMobileAreaListVisible ? ' is-open' : ''}${isLoading ? ' is-loading' : ''}`} type="button" onClick={() => void toggleMobileAreaList()} aria-expanded={isMobileAreaListVisible} aria-busy={isLoading} disabled={isLoading}>{isLoading ? t('map.loading') : isMobileAreaListVisible ? t('map.closeList') : t('map.area', { count: result.meta.total_count.toLocaleString(locale) })}</button>}
            {error && !result && <span className="error-message">{mapSystemNotice(error, locale)}</span>}
          </div>
          <button className={`location-button${hasMapCard ? ' is-with-card' : ''}`} type="button" onClick={() => void moveToCurrentLocation()} disabled={isLocating}>
            {isLocating ? t('map.checking') : t('map.currentLocation')}
          </button>
        </div>
        {mobileZoomGuideKey !== null && <div key={mobileZoomGuideKey} className="mobile-map-zoom-guide" role="status" aria-live="polite">
          <span className="mobile-map-zoom-motion" aria-hidden="true"><i /><i /><b /></span>
          <strong>{t('map.zoomTouch')}</strong>
          <span>{t('map.zoomHint')}</span>
        </div>}
        {isDesktop && result && <aside className="desktop-area-list" aria-label={t('map.list')}>
          <header className="desktop-area-list-header">
            <div>
              <strong>{t('map.area', { count: result.meta.total_count.toLocaleString(locale) })}</strong>
              <span>{t(distanceSource === 'current-location' ? 'map.nearest' : 'map.nearestPoint')}</span>
            </div>
            {isLoading && <em>{t('common.loading')}</em>}
          </header>
          <div className="desktop-area-list-content">
            {isListZoomLimited && <p className="map-list-zoom-guide">{t('map.zoomList')}</p>}
            {!isListZoomLimited && areaToilets.length === 0 && !isLoading && <p className="desktop-area-list-status">{t('map.empty')}</p>}
            {!isListZoomLimited && sortedAreaToiletGroups.map((group) => {
              const representative = representativeToilet(group)
              const displayName = group.displayGroupName || representative.name
              const additionalCount = group.count - 1
              const distance = distanceReference ? formatDistance(calculateDistanceInMeters(distanceReference, representative)) : '—'
              return <button key={`${group.latitude}:${group.longitude}`} type="button" className="desktop-area-list-item" onClick={() => selectMobileAreaToilet(representative)}>
                <strong><span className="desktop-area-list-name">{displayName || t('map.unnamed')}</span>{additionalCount > 0 && <span className="desktop-area-list-additional">{group.displayGroupName ? t('map.facilities', { count: additionalCount + 1 }) : `+${additionalCount}`}</span>}</strong>
                <span className={`desktop-area-list-type ${toiletTypeTone(representative.toiletType)}`}>{toiletTypeLabel(representative.toiletType || '공중화장실', locale)}</span>
                <span className="desktop-area-list-distance">{distance}</span>
              </button>
            })}
          </div>
        </aside>}
        {isMobileAreaListVisible && <aside className="mobile-area-list" aria-label={t('map.list')}>
          <button className="mobile-area-list-handle" type="button" onClick={() => setIsMobileAreaListOpen(false)} aria-label={t('map.closeList')} />
          {!isListZoomLimited && <div className="mobile-area-list-header"><span>{t('map.name')}</span><span>{t('map.type')}</span><span>{t('map.distance')}</span></div>}
          <div className="mobile-area-list-content">
            {!isListZoomLimited && isMobileAreaListLoading && <p className="mobile-area-list-status">{t('common.loading')}</p>}
            {!isListZoomLimited && !isMobileAreaListLoading && areaToilets.length === 0 && <p className="mobile-area-list-status">{t('map.empty')}</p>}
            {!isListZoomLimited && !isMobileAreaListLoading && sortedAreaToiletGroups.map((group) => {
              const representative = representativeToilet(group)
              const displayName = group.displayGroupName || representative.name
              const additionalCount = group.count - 1
              const distance = distanceReference ? formatDistance(calculateDistanceInMeters(distanceReference, representative)) : '—'
              return <button key={`${group.latitude}:${group.longitude}`} type="button" className="mobile-area-list-item" onClick={() => selectMobileAreaToilet(representative)}>
                <strong>
                  <span className="mobile-area-list-name">{displayName || t('map.unnamed')}</span>
                  {additionalCount > 0 && <span className="mobile-area-list-additional">{group.displayGroupName ? t('map.facilities', { count: additionalCount + 1 }) : `+${additionalCount}`}</span>}
                </strong>
                <span className={`mobile-area-list-type ${toiletTypeTone(representative.toiletType)}`}>{toiletTypeLabel(representative.toiletType || '공중화장실', locale)}</span>
                <span className="mobile-area-list-distance">{distance}</span>
              </button>
            })}
          </div>
        </aside>}
        {locationMessage && <p className="location-message" role="status">{mapSystemNotice(locationMessage, locale)}</p>}
        {displayToiletDetail && !toiletCoordinates(displayToiletDetail) && !displaySelectedToilet && !displaySelectedCoordinateGroup && (
          <aside className="place-card initial-route-card" aria-label={t('detail.title')}>
            <button type="button" className="close-button" onClick={closeDetailCard} aria-label={t('common.close')}>×</button>
            <OriginalSourceBadge toilet={displayToiletDetail} locale={locale} />
            <h1>{displayToiletDetail.name}</h1>
            <p>{t('map.noCoordinates')}</p>
            <p className="open-time">{formatOpenTime(displayToiletDetail, locale)}</p>
            {REVIEW_UI_ENABLED && <ToiletCommunityRow onReview={() => reviewPreview.open(displayToiletDetail)} reviewEntry={reviewPreview.entryState(displayToiletDetail.id)} previewSummary={reviewPreview.summary(displayToiletDetail.id)} />}
            <PublicReviews toiletId={displayToiletDetail.id} toiletName={displayToiletDetail.name} toiletType={displayToiletDetail.toiletType} summary={reviewPreview.summary(displayToiletDetail.id)} />
            <ToiletDetailContents toilet={displayToiletDetail} />
          </aside>
        )}
        {displaySelectedToilet && (
          <aside
            ref={placeCardRef}
            className={`place-card${isMobileCardExpanded ? ' mobile-card-expanded' : ''}${selectedCoordinateGroup ? ' place-card-with-group' : ''}`}
            aria-live="polite"
            style={placeCardPosition ? { left: placeCardPosition.left, top: placeCardPosition.top } : undefined}
          >
            <button type="button" className="close-button" onClick={closeDetailCard} aria-label={t('common.close')}>×</button>
            <button type="button" className="mobile-card-handle"
              onTouchStart={event => cardHandleGesture.start(event.touches)}
              onTouchMove={event => cardHandleGesture.move(event.touches)}
              onTouchCancel={() => cardHandleGesture.cancel()}
              onTouchEnd={event => { if (cardHandleGesture.end(event.changedTouches)) setIsMobileCardExpanded(true) }}
              onClick={() => {
                if (!cardHandleGesture.acceptsClick()) return
                if (cardScrollRef.current) cardScrollRef.current.scrollTop = 0
                setIsMobileCardExpanded(expanded => !expanded)
              }} aria-expanded={isMobileCardExpanded}>
              {t(isMobileCardExpanded ? 'map.collapse' : 'detail.show')}
            </button>
            <div className="place-card-summary">
              <div className="card-label-row"><span className="card-label">{toiletTypeLabel(displayToiletDetail?.toiletType || displaySelectedToilet.toiletType, locale)}</span><OriginalSourceBadge toilet={displayToiletDetail} locale={locale} /></div>
              {REVIEW_UI_ENABLED ? <div className="review-card-title-row"><h1>{displayToiletDetail?.name || displaySelectedToilet.name}</h1><ToiletReportEntry disabled={!displayToiletDetail || displaySelectedToilet.id === testToilet?.id} onClick={() => { if (displayToiletDetail) openReport({ toilet: displayToiletDetail, latitude: displaySelectedToilet.latitude, longitude: displaySelectedToilet.longitude }) }} /></div> : <h1>{displayToiletDetail?.name || displaySelectedToilet.name}</h1>}
            </div>
            <div ref={cardScrollRef} className="card-scroll-content">
              {displayToiletDetail ? <p className="open-time">{displayToiletDetail.id === testToilet?.id ? t('map.reviewTestNotice') : formatOpenTime(displayToiletDetail, locale)}</p> : isDetailLoading && <LoadingOpenTime />}
              {distanceToSelectedToilet && <div className="distance-from-current"><span className="distance-label">{distanceReferenceLabel}</span><strong className="distance-value">{distanceToSelectedToilet}</strong><span className="distance-caption">{t('map.straightLine')}</span></div>}
              <ToiletCommunityRow pendingReport={!isDesktop && !displayToiletDetail} onReport={isDesktop ? undefined : displayToiletDetail ? () => openReport({ toilet: displayToiletDetail, latitude: displaySelectedToilet.latitude, longitude: displaySelectedToilet.longitude }) : undefined}
                pendingReview={REVIEW_UI_ENABLED && !displayToiletDetail} onReview={REVIEW_UI_ENABLED && displayToiletDetail ? () => reviewPreview.open(displayToiletDetail) : undefined} reviewEntry={reviewPreview.entryState(displaySelectedToilet.id)} previewSummary={REVIEW_UI_ENABLED ? reviewPreview.summary(displaySelectedToilet.id) : undefined} />
              {displayToiletDetail && <PublicReviews toiletId={displayToiletDetail.id} toiletName={displayToiletDetail.name} toiletType={displayToiletDetail.toiletType} summary={reviewPreview.summary(displayToiletDetail.id)} />}
              {!displayToiletDetail && isDetailLoading && <PublicReviewsLoading />}
              {detailError && <div><p className="detail-error" role="alert">{t('detail.error')}</p><button type="button" className="detail-retry" onClick={retryDetail}>{t('common.retry')}</button></div>}
              {!displayToiletDetail && isDetailLoading && <DetailLoadingFields />}
              {displayToiletDetail && (displayToiletDetail.id === testToilet?.id
                ? <div className="card-details"><p>{t('map.reviewTestDescription')}</p></div>
                : <ToiletDetailContents toilet={displayToiletDetail} />)}
            </div>
          </aside>
        )}
        {displaySelectedCoordinateGroup && (
          <aside className="coordinate-group-card" aria-live="polite" aria-label={t('map.groupList')}>
            <button type="button" className="close-button" onClick={closeDetailCard} aria-label={t('map.closeList')}>×</button>
            <header className="coordinate-group-header">
              <div className="coordinate-group-meta-row">
                <div className="coordinate-group-labels">
                  <span className="card-label">{[...new Set(displaySelectedCoordinateGroup.toilets.map(item => toiletTypeLabel(item.toiletType, locale)))].join(' · ')}</span>
                  {displaySelectedCoordinateGroup.displayGroupName && <span className="coordinate-group-admin-badge" title={t('map.adminHint')}>{t('map.admin')}<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2.5 6.2 2.2 2.2 4.8-4.8" /></svg></span>}
                  {locale !== 'ko' && (/[가-힣]/.test(displaySelectedCoordinateGroup.displayGroupName ?? '') || displaySelectedCoordinateGroup.toilets.some(item => /[가-힣]/.test(item.name))) && <small className="source-language-badge">{t('detail.originalKorean')}</small>}
                </div>
                {distanceToCoordinateGroup && <p className="coordinate-group-distance">{distanceReferenceLabel} <strong>{distanceToCoordinateGroup}</strong></p>}
              </div>
              {displaySelectedCoordinateGroup.displayGroupName && <h2 className="coordinate-group-display-name">{displaySelectedCoordinateGroup.displayGroupName}</h2>}
              <p className="coordinate-group-description">{t('map.expandHint')}</p>
            </header>
            <div ref={coordinateGroupListRef} className="coordinate-group-list">
              {displaySelectedCoordinateGroup.toilets.map((toilet, index) => {
                const isExpanded = expandedCoordinateToilet?.id === toilet.id
                return <div key={toilet.id} ref={(node) => { if (node) coordinateGroupItemRefs.current.set(toilet.id, node); else coordinateGroupItemRefs.current.delete(toilet.id) }} className={`coordinate-group-item${isExpanded ? ' is-expanded' : ''}`}>
                  <button type="button" className="coordinate-group-item-toggle" onClick={() => void toggleCoordinateToiletDetail(toilet)} aria-expanded={isExpanded}>
                    <span className="coordinate-group-index" aria-hidden="true">{index + 1}</span>
                    <span className="coordinate-group-name">{toilet.name || t('map.unnamed')}</span>
                    <span className="coordinate-group-toggle-label">{t(isExpanded ? 'map.collapse' : 'map.expand')}</span>
                  </button>
                  {isExpanded && <CoordinateGroupInlineDetails
                    toilet={toiletDetail}
                    isLoading={isDetailLoading}
                    error={detailError}
                    onRetry={retryDetail}
                    onReport={isDesktop && !REVIEW_UI_ENABLED ? undefined : () => { if (toiletDetail?.id === toilet.id) openReport({ toilet: toiletDetail, latitude: toilet.latitude, longitude: toilet.longitude }) }}
                    pendingReview={REVIEW_UI_ENABLED && !toiletDetail}
                    onReview={REVIEW_UI_ENABLED && toiletDetail?.id === toilet.id ? () => reviewPreview.open(toiletDetail) : undefined}
                    reviewEntry={reviewPreview.entryState(toilet.id)}
                    previewSummary={REVIEW_UI_ENABLED ? reviewPreview.summary(toilet.id) : undefined}
                  />}
                </div>
              })}
            </div>
          </aside>
        )}
        </div>
        {!isDesktop && mobileTab !== 'map' && <MobilePage key={`mobile-${authProfile?.userId ?? 'anonymous'}`} tab={mobileTab} profile={authProfile} loading={isAuthLoading} unread={unreadNotificationCount}
          accountView={mobileAccountView} focusedReportId={focusedReportId} reviewPage={reviewPreview.page}
          onBackAccount={() => { reviewPreview.close(); setMobileAccountView('home'); setFocusedReportId(null) }}
          onSessionExpired={handleSessionExpired}
          onReviews={REVIEW_UI_ENABLED ? reviewPreview.openMine : undefined}
          onProfile={setAuthProfile} onReports={openMyReports} onAccount={() => setMobileAccountView('settings')} onWithdrawn={handleWithdrawn} onLogout={handleLogout} onCountChange={refreshNotificationCount} onOpenReport={showReportHistory}
          beforeLogin={tab => { try { window.sessionStorage.setItem(PENDING_MOBILE_TAB_KEY, tab) } catch { /* 로그인은 계속 제공 */ } }} />}
        {reportTarget && <ToiletReportModal toilet={reportTarget.toilet} latitude={reportTarget.latitude} longitude={reportTarget.longitude} onClose={() => setReportTarget(null)} onViewMyReports={() => { setReportTarget(null); showReportHistory() }} />}
        {reviewPreview.modal}
        {authProfile && isDesktop && isMyReportsOpen && <MyReportsPanel key={`reports-${authProfile.userId}`} onSessionExpired={handleSessionExpired} initialExpandedId={focusedReportId} onClose={() => { setIsMyReportsOpen(false); setFocusedReportId(null) }} />}
        {authProfile && isDesktop && isNotificationsOpen && <NotificationPanel key={`inbox-${authProfile.userId}`} unread={unreadNotificationCount} onSessionExpired={handleSessionExpired} onClose={() => setIsNotificationsOpen(false)} onCountChange={refreshNotificationCount} onOpenReport={(reportId) => { setIsNotificationsOpen(false); showReportHistory(reportId) }} />}
        {isLoginDialogOpen && <LoginDialog purpose={loginPurpose} onClose={closeLoginDialog} />}
        {authProfile?.consentRequired && <PolicyConsentModal isNewRegistration={authProfile.status === 'PENDING_CONSENT'} onComplete={handleConsentComplete} onLogout={handleLogout} />}
        {authProfile && isAccountOpen && <AccountDialog profile={authProfile} onClose={() => setIsAccountOpen(false)} onWithdrawn={handleWithdrawn} />}
        {withdrawalNotice && <div className="account-backdrop"><section className="account-dialog account-recovery account-result" role="dialog" aria-modal="true" aria-labelledby="withdrawal-result-title">
          <h1 id="withdrawal-result-title">{t('account.resultTitle')}</h1>
          <p role="status">{withdrawalNotice}</p>
          <p><a href="mailto:privacy@geupddong.com">{t('account.contact')}</a></p>
          <div className="recovery-actions"><button type="button" className="recovery-primary" onClick={() => setWithdrawalNotice(null)}>{t('account.confirm')}</button></div>
        </section></div>}
        {!isAuthLoading && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('recovery') === 'required' && <AccountRecoveryDialog />}
      </section>
      {isDesktop ? <footer className="site-footer"><p>{t('map.footer')}</p><PolicyFooter /></footer> : <MobileNavigation tab={mobileTab} unread={unreadNotificationCount} onChange={tab => { reviewPreview.close(); setMobileAccountView('home'); setMobileTab(tab); setIsPlaceSearchFocused(false); setIsMyReportsOpen(false); setIsNotificationsOpen(false); setIsAccountOpen(false); setFocusedReportId(null) }} />}
    </main>
  )
}


function LoginDialog({ purpose, onClose }: { purpose: LoginPurpose; onClose: () => void }) {
  const t = useMessages(), locale = useLocale()
  const title = t('auth.title')
  const description = t(({ review: 'review.loginRequired', 'my-reports': 'auth.reportsLogin', report: 'auth.reportLogin', general: 'auth.intro' } as const)[purpose])
  return <div className="login-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-modal-title">
      <button type="button" className="login-modal-close" onClick={onClose} aria-label={t('auth.close')}>×</button>
      <span className="brand login-brand" aria-label={locale === 'ko' ? '급똥' : 'Geupddong'}><BrandWordmark locale={locale} /></span>
      <h1 id="login-modal-title">{title}</h1>
      <p>{description}</p>
      <button type="button" className="social-login google-login" onClick={() => startSocialLogin('google')}>{t('auth.google')}</button>
      <button type="button" className="social-login kakao-login" onClick={() => startSocialLogin('kakao')}>{t('auth.kakao')}</button>
      <p className="login-policy-note">{t('auth.ageNote')}</p>
      <nav className="login-policy-links"><a href={localizedPublicPath('/policies/terms', locale)!} target="_blank" rel="noreferrer">{t('policy.terms')}</a><a href={localizedPublicPath('/policies/privacy', locale)!} target="_blank" rel="noreferrer">{t('policy.privacy')}</a></nav>
    </section>
  </div>
}

function CoordinateGroupInlineDetails({ toilet, isLoading, error, onReport, onRetry, onReview, pendingReview, previewSummary, reviewEntry }: { toilet: ToiletDetailResponse | null; isLoading: boolean; error: string | null; onReport?: () => void; onRetry: () => void; onReview?: () => void; pendingReview?: boolean; previewSummary?: PreviewReviewSummary; reviewEntry?: ReviewEntryState }) {
  const t = useMessages()
  const locale = useLocale()
  if (isLoading && !toilet) return <div className="coordinate-inline-details"><div className="coordinate-opening-row"><LoadingOpenTime />{onReport && <ToiletReportEntry iconOnly disabled />}</div><ToiletCommunityRow pendingReview={pendingReview} /><PublicReviewsLoading /><DetailLoadingFields inline /></div>
  if (error) return <div className="coordinate-inline-details"><p className="detail-error" role="alert">{t('detail.error')}</p><button type="button" className="detail-retry" onClick={onRetry}>{t('common.retry')}</button></div>
  if (!toilet) return null

  const display = localizeToiletDetail(toilet, locale)
  const address = getDisplayAddress(display.roadAddress, display.jibunAddress)

  return <div className="coordinate-inline-details">
    <OriginalSourceBadge toilet={display} locale={locale} />
    <div className="coordinate-opening-row"><p className="open-time">{formatOpenTime(display, locale)}</p>{onReport && <ToiletReportEntry iconOnly onClick={onReport} />}</div>
    <ToiletCommunityRow onReview={onReview} reviewEntry={reviewEntry} previewSummary={previewSummary} />
    <PublicReviews toiletId={display.id} toiletName={display.name} toiletType={display.toiletType} summary={previewSummary} />
    {address && <DetailRow className="coordinate-inline-address" label={t('detail.address')} value={address} copyable />}
    <section className="coordinate-inline-section coordinate-inline-capacity-section" aria-label={t('detail.capacity')}>
      <h2>{t('detail.capacity')}</h2>
      <dl className="coordinate-inline-capacity">
        <div><dt>{t('detail.maleToilets')}</dt><dd>{display.maleToiletCount}<small>{locale === 'ko' ? '대' : ''}</small></dd></div>
        <div><dt>{t('detail.femaleToilets')}</dt><dd>{display.femaleToiletCount}<small>{locale === 'ko' ? '대' : ''}</small></dd></div>
      </dl>
    </section>
    <section className="coordinate-inline-facilities" aria-label={t('detail.safety')}>
      <h2>{t('detail.safety')}</h2>
      <div className="coordinate-facility-list">
        <CompactFacilityStatus label={t('detail.bell')} available={display.hasEmergencyBell === 'Y'} location={display.emergencyBellLocation} />
        <CompactFacilityStatus label="CCTV" available={display.hasCctv === 'Y'} />
        <CompactFacilityStatus label={t('detail.diaper')} available={display.hasDiaperTable === 'Y'} location={display.diaperTableLocation} />
      </div>
    </section>
    {hasValue(display.agencyName) && <DetailRow className="coordinate-inline-agency" label={t('detail.agency')} value={display.agencyName} />}
  </div>
}

function CompactFacilityStatus({ label, available, location }: { label: string; available: boolean; location?: string }) {
  const t = useMessages()
  const locale = useLocale()
  if (!available) return <div className="coordinate-facility"><span>{label}</span><strong className="is-unavailable">{t('detail.unavailable')}</strong></div>
  if (!hasValue(location ?? '')) return <div className="coordinate-facility"><span>{label}</span><strong>{t('detail.available')}</strong></div>

  return <details className="coordinate-facility coordinate-facility-with-location">
    <summary><span>{label}</span><strong>{t('detail.available')}</strong><span className="coordinate-facility-location">{t('detail.location')} <i aria-hidden="true" /></span></summary>
    <p>{formatFacilityLocation(location ?? '', locale)}</p>
  </details>
}


export default MapApp
