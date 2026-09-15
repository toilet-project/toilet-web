'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  ANALYTICS_CONSENT_EVENT,
  ANALYTICS_SETTINGS_EVENT,
  loadGoogleAnalytics,
  openAnalyticsSettings,
  readAnalyticsConsent,
  trackEvent,
  trackPageView,
  writeAnalyticsConsent,
  type AnalyticsConsent,
} from '../lib/analytics'

export function AnalyticsConsentController() {
  const pathname = usePathname()
  const [consent, setConsent] = useState<AnalyticsConsent>('unknown')
  const [open, setOpen] = useState(false)
  const lastPage = useRef('')

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const current = readAnalyticsConsent()
      setConsent(current)
      setOpen(current === 'unknown')
    })
    const changed = (event: Event) => setConsent((event as CustomEvent<AnalyticsConsent>).detail)
    const settings = () => setOpen(true)
    window.addEventListener(ANALYTICS_CONSENT_EVENT, changed)
    window.addEventListener(ANALYTICS_SETTINGS_EVENT, settings)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, changed)
      window.removeEventListener(ANALYTICS_SETTINGS_EVENT, settings)
    }
  }, [])

  useEffect(() => {
    if (consent !== 'granted') return
    const page = pathname || '/'
    if (lastPage.current === page) return
    lastPage.current = page
    void loadGoogleAnalytics().then(() => trackPageView(page)).catch(() => undefined)
  }, [consent, pathname])

  useEffect(() => {
    if (consent !== 'granted') return
    const sent = new Set<number>()
    const onScroll = () => {
      const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      const depth = Math.round(window.scrollY * 100 / scrollable)
      for (const threshold of [50, 90]) {
        if (depth >= threshold && !sent.has(threshold)) {
          sent.add(threshold)
          trackEvent('scroll_depth', { percent: threshold })
        }
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [consent, pathname])

  if (!open) return null
  const decided = consent !== 'unknown'
  const choose = (value: 'granted' | 'denied') => {
    writeAnalyticsConsent(value)
    setConsent(value)
    setOpen(false)
  }
  return <aside className="analytics-consent" role="dialog" aria-labelledby="analytics-consent-title" aria-describedby="analytics-consent-description">
    <div className="analytics-consent-copy">
      <span className="analytics-consent-icon" aria-hidden="true">↗</span>
      <div><strong id="analytics-consent-title">서비스 이용 분석을 허용할까요?</strong><p id="analytics-consent-description">Google Analytics로 방문·조회·기능 사용의 집계만 확인합니다. 검색어, 계정 정보, 정확한 위치와 주소는 보내지 않으며 거부해도 모든 기능을 이용할 수 있습니다.</p><a href="/policies/privacy#analytics">자세히 보기</a></div>
    </div>
    <div className="analytics-consent-actions"><button type="button" className="analytics-consent-secondary" onClick={() => choose('denied')}>{decided && consent === 'granted' ? '사용 중지' : '거부'}</button><button type="button" className="analytics-consent-primary" onClick={() => choose('granted')}>{decided && consent === 'granted' ? '계속 허용' : '허용'}</button></div>
  </aside>
}

export function AnalyticsSettingsButton() {
  return <button type="button" className="analytics-settings-button" onClick={openAnalyticsSettings}>분석 설정</button>
}
