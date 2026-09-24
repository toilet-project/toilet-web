'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { trackEngagement, trackEvent, trackPageView } from '../lib/analytics'
import { observeVisibleEngagement } from '../lib/visible-engagement'

export function ServiceAnalytics() {
  const pathname = usePathname()
  const lastPage = useRef('')

  useEffect(() => {
    const page = pathname || '/'
    if (lastPage.current === page) return
    lastPage.current = page
    // The analytics sender starts a session once before its first event, including
    // when sessionStorage is unavailable or the previous session has expired.
    trackPageView(page)
  }, [pathname])

  useEffect(() => {
    const page = pathname || '/'
    const isActive = () => document.visibilityState === 'visible' && document.hasFocus()
    const stopEngagement = observeVisibleEngagement(seconds => trackEngagement(page, seconds))
    const sent = new Set<number>()
    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight
      if (scrollable <= 0 || !isActive()) return
      const depth = Math.round(window.scrollY * 100 / scrollable)
      for (const threshold of [50, 90]) {
        if (depth >= threshold && !sent.has(threshold)) {
          sent.add(threshold)
          trackEvent('scroll_depth', { percent: threshold, path: page })
        }
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      stopEngagement()
    }
  }, [pathname])

  return null
}
