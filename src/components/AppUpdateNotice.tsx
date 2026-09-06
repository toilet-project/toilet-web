'use client'

import { useEffect, useState } from 'react'
import { createVersionCheck, UPDATE_CHECK_INTERVAL } from '../lib/appUpdate'

export function AppUpdateNotice({ blocked, beforeReload }: { blocked: boolean; beforeReload: () => boolean }) {
  const [available, setAvailable] = useState(false)
  const [message, setMessage] = useState('새 버전이 준비됐어요.')
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
  return <aside className="app-update-notice" aria-label="사이트 업데이트">
    <span role="status">{blocked ? '현재 작업을 마친 뒤 업데이트해 주세요.' : message}</span>
    <button type="button" disabled={blocked} onClick={() => {
      if (blocked || document.querySelector('[role="dialog"], [aria-modal="true"]')) return
      if (!beforeReload()) { setMessage('지도 화면이 준비되면 다시 눌러 주세요.'); return }
      // Explicit user action only. Never clear cookies, all storage or browser caches.
      window.location.reload()
    }}>업데이트</button>
  </aside>
}
