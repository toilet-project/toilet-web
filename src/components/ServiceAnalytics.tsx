'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { trackEngagement, trackEvent, trackPageView, trackSessionStart } from '../lib/analytics'

export function ServiceAnalytics() {
  const pathname = usePathname()
  const lastPage = useRef('')

  useEffect(() => {
    const page = pathname || '/'
    if (lastPage.current === page) return
    lastPage.current = page
    try {
      if (!window.sessionStorage.getItem('geupddong.analytics-session-started.v1')) {
        window.sessionStorage.setItem('geupddong.analytics-session-started.v1', '1')
        trackSessionStart(page)
      }
    } catch {
      trackSessionStart(page)
    }
    trackPageView(page)
  }, [pathname])

  useEffect(() => {
    const page = pathname || '/'
    const startedAt = Date.now()
    const sent = new Set<number>()
    let finished = false
    const onScroll = () => {
      const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      const depth = Math.round(window.scrollY * 100 / scrollable)
      for (const threshold of [50, 90]) {
        if (depth >= threshold && !sent.has(threshold)) {
          sent.add(threshold)
          trackEvent('scroll_depth', { percent: threshold, path: page })
        }
      }
    }
    const finish = () => {
      if (finished) return
      finished = true
      trackEngagement(page, (Date.now() - startedAt) / 1000)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', finish, { once: true })
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', finish)
      finish()
    }
  }, [pathname])

  return null
}
