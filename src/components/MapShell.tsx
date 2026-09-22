'use client'

import dynamic from 'next/dynamic'
import { Component, useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore, type ErrorInfo, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { MapRouteContext, type MapRouteData } from './mapRouteContext'
import { toiletPath } from '../lib/toiletRoute'
import { regionToiletPath } from '../lib/regionToiletPath'
import { getReviewTestHash, subscribeReviewTestHash } from '../lib/reviewTestToilet'
import { localeForPath, localizedPublicPath } from '../i18n/routes'
import { rememberLocale, type Locale } from '../i18n/locale'
import { consumeLanguageLoginReturn } from '../i18n/loginReturn'
import { ENGLISH_UI_ENABLED } from '../i18n/feature'
import { MAP_NAVIGATION_EVENT } from '../lib/navigationCache'
import { loadedNaverMapLanguage } from '../lib/mapProvider'
import { naverMapLanguageForLocale, naverMapLanguageNeedsReload, resolveMapProvider } from '../lib/mapProviderSelection'
import { useLocale } from '../i18n/context'
import { message } from '../i18n/messages'

const noServerTestHash = () => ''

// The SDK and browser-only effects stay in the existing map. Policy/SEO routes stay server rendered.
const MapApp = dynamic(() => import('../App'), { ssr: false })

class MapErrorBoundary extends Component<{ children: ReactNode; locale: Locale }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('급똥 화면 렌더링 오류', error, info) }
  render() {
    if (this.state.failed) return <main className="app-error"><strong>{message(this.props.locale, 'error.load')}</strong><p>{message(this.props.locale, 'error.retryHint')}</p></main>
    return this.props.children
  }
}

export function MapShell({ children }: { children: ReactNode }) {
  const locale = useLocale()
  const testToiletHash = useSyncExternalStore(subscribeReviewTestHash, getReviewTestHash, noServerTestHash)
  const router = useRouter()
  const routerRef = useRef(router)
  useLayoutEffect(() => { routerRef.current = router }, [router])
  useLayoutEffect(() => {
    // Direct /ja and /zh-* visits must also restore their map language after
    // reading the canonical Korean legal documents.
    const url = new URL(window.location.href)
    const locale = localeForPath(url.pathname)
    if (locale === 'ko' && (url.searchParams.has('login') || url.searchParams.has('recovery'))) return
    try { rememberLocale(window.localStorage, locale) } catch { /* Optional preference. */ }
  }, [])
  useLayoutEffect(() => {
    if (!ENGLISH_UI_ENABLED) return
    const url = new URL(window.location.href)
    try {
      const target = consumeLanguageLoginReturn(window.sessionStorage, url.searchParams.get('login')
        ?? (url.searchParams.get('recovery') === 'required' ? 'recovery' : null))
      if (target && target !== url.pathname) routerRef.current.replace(target + url.search, { scroll: false })
    } catch { /* Normal login completion must remain usable without storage. */ }
  }, [])
  const [route, setRoute] = useState<MapRouteData | null>(null)
  const [mounted, setMounted] = useState(false)
  const register = useCallback((next: MapRouteData) => {
    let browserPath = window.location.pathname
    try { browserPath = decodeURI(browserPath).normalize('NFC') } catch { return }
    if (browserPath.replace(/\/$/, '') !== next.path.replace(/\/$/, '')) return
    setRoute(next)
  }, [])
  const onMounted = useCallback(() => setMounted(true), [])
  const navigate = useCallback((id: number | null) => {
    const path = localizedPublicPath(id === null ? '/' : toiletPath(id), localeForPath(window.location.pathname))!
    // Also cancels an in-flight detail navigation when the user closes before it resolves.
    routerRef.current.push(path + getReviewTestHash(), { scroll: false })
  }, [])
  const changeLocale = useCallback((locale: Locale, id: number | null) => {
    const currentPath = id !== null && route?.detail?.id === id ? regionToiletPath(route.detail, locale) : id === null ? '/' : toiletPath(id)
    const path = localizedPublicPath(currentPath, locale)
    if (!path) return
    try { rememberLocale(window.localStorage, locale) } catch { /* Preference storage is optional. */ }
    const target = path + window.location.search + window.location.hash
    // NAVER publishes the map-label language at SDK load time. A new document is
    // needed only when its language changes; preserve the viewport before leaving.
    if (resolveMapProvider(locale) === 'naver'
      && naverMapLanguageNeedsReload(loadedNaverMapLanguage(), naverMapLanguageForLocale(locale))) {
      window.dispatchEvent(new CustomEvent(MAP_NAVIGATION_EVENT, { detail: path }))
      window.location.assign(target)
      return
    }
    routerRef.current.push(target, { scroll: false })
  }, [route])
  return <MapRouteContext.Provider value={{ mounted, register }}>
    <MapErrorBoundary locale={locale}>{route && <MapApp key={testToiletHash} testToiletHash={testToiletHash} route={route} onNavigate={navigate} onLocaleChange={changeLocale} onMounted={onMounted} />}</MapErrorBoundary>
    {children}
  </MapRouteContext.Provider>
}
