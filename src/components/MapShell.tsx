'use client'

import dynamic from 'next/dynamic'
import { Component, useCallback, useLayoutEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { MapRouteContext, type MapRouteData } from './mapRouteContext'
import { toiletPath } from '../lib/toiletRoute'

// The SDK and browser-only effects stay in the existing map. Policy/SEO routes stay server rendered.
const MapApp = dynamic(() => import('../App'), { ssr: false })

class MapErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('급똥 화면 렌더링 오류', error, info) }
  render() {
    if (this.state.failed) return <main className="app-error"><strong>화면을 불러오지 못했습니다.</strong><p>잠시 후 새로고침해 주세요.</p></main>
    return this.props.children
  }
}

export function MapShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const routerRef = useRef(router)
  useLayoutEffect(() => { routerRef.current = router }, [router])
  const [route, setRoute] = useState<MapRouteData | null>(null)
  const [mounted, setMounted] = useState(false)
  const register = useCallback((next: MapRouteData) => {
    if (window.location.pathname.replace(/\/$/, '') !== next.path.replace(/\/$/, '')) return
    setRoute(next)
  }, [])
  const onMounted = useCallback(() => setMounted(true), [])
  const navigate = useCallback((id: number | null) => {
    const path = id === null ? '/' : toiletPath(id)
    // Also cancels an in-flight detail navigation when the user closes before it resolves.
    routerRef.current.push(path, { scroll: false })
  }, [])
  return <MapRouteContext.Provider value={{ mounted, register }}>
    <MapErrorBoundary>{route && <MapApp route={route} onNavigate={navigate} onMounted={onMounted} />}</MapErrorBoundary>
    {children}
  </MapRouteContext.Provider>
}
