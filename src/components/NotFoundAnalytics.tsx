'use client'

import { useEffect } from 'react'
import { trackEvent } from '../lib/analytics'

export function NotFoundAnalytics() {
  useEffect(() => { trackEvent('screen_view', { screen: 'not_found' }) }, [])
  return null
}
