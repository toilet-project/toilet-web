'use client'

import { useEffect, useState } from 'react'
import { createVersionCheck, UPDATE_CHECK_INTERVAL } from '../lib/appUpdate'
import { useMessages } from '../i18n/context'

export function AppUpdateNotice({ blocked, beforeReload }: { blocked: boolean; beforeReload: () => boolean }) {
  const t = useMessages()
  const [available, setAvailable] = useState(false)
  const [waitForMap, setWaitForMap] = useState(false)
  useEffect(() => {
    const checker = createVersionCheck(process.env.NEXT_PUBLIC_APP_VERSION || 'development', () => setAvailable(true))
    const check = () => { if (document.visibilityState === 'visible') void checker.check() }
    check()
    window.addEventListener('focus', check)
    window.addEventListener('pageshow', check)
    document.addEventListener('visibilitychange', check)
    const timer = window.setInterval(check, UPDATE_CHECK_INTERVAL)
    return () => {
      checker.dispose()
      clearInterval(timer)
      window.removeEventListener('focus', check)
      window.removeEventListener('pageshow', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  if (!available) return null
  return <aside className="app-update-notice" aria-label={t('update.title')}>
    <span role="status">{blocked ? t('update.blocked') : t(waitForMap ? 'update.waitMap' : 'update.available')}</span>
    <button type="button" disabled={blocked} onClick={() => {
      if (blocked || document.querySelector('[role="dialog"], [aria-modal="true"]')) return
      if (!beforeReload()) { setWaitForMap(true); return }
      // Explicit user action only. Never clear cookies, all storage or browser caches.
      window.location.reload()
    }}>{t('update.action')}</button>
  </aside>
}
