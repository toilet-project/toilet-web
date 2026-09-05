'use client'

import dynamic from 'next/dynamic'
import { Component, type ErrorInfo, type ReactNode } from 'react'

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

export function MapShell() {
  return <MapErrorBoundary><MapApp /></MapErrorBoundary>
}
