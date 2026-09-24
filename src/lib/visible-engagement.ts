export const ENGAGEMENT_HEARTBEAT_MS = 30_000

/** Counts visible, focused intervals; drains deltas so lifecycle events cannot double count. */
export function createVisibleEngagementClock(now: () => number, initiallyActive: boolean) {
  let active = initiallyActive
  let startedAt = now()
  let pendingMs = 0
  const accrue = () => {
    const current = now()
    if (active) pendingMs += Math.max(0, current - startedAt)
    startedAt = current
  }
  return {
    setActive(value: boolean) {
      accrue()
      active = value
    },
    drainSeconds() {
      accrue()
      const seconds = Math.floor(pendingMs / 1000)
      pendingMs -= seconds * 1000
      return seconds
    },
  }
}

/** One observer per route. BFCache restores resume it; route cleanup disposes it. */
export function observeVisibleEngagement(
  report: (seconds: number) => void,
  pageDocument: Document = document,
  pageWindow: Window = window,
) {
  let suspended = false
  let disposed = false
  const isActive = () => !suspended && pageDocument.visibilityState === 'visible' && pageDocument.hasFocus()
  const clock = createVisibleEngagementClock(() => pageWindow.performance.now(), isActive())
  const flush = () => {
    const seconds = clock.drainSeconds()
    if (seconds > 0) report(seconds)
  }
  const activityChanged = () => {
    if (disposed) return
    const active = isActive()
    clock.setActive(active)
    if (!active) flush()
  }
  // Use blur itself, not hasFocus(): browsers can update focus after dispatching blur.
  const blur = () => {
    if (disposed) return
    clock.setActive(false)
    flush()
  }
  const suspend = () => {
    suspended = true
    blur()
  }
  const resume = () => {
    if (disposed) return
    suspended = false
    activityChanged()
  }
  const heartbeat = pageWindow.setInterval(() => {
    if (disposed) return
    activityChanged()
    flush()
  }, ENGAGEMENT_HEARTBEAT_MS)
  pageDocument.addEventListener('visibilitychange', activityChanged)
  pageDocument.addEventListener('freeze', suspend)
  pageDocument.addEventListener('resume', resume)
  pageWindow.addEventListener('focus', activityChanged)
  pageWindow.addEventListener('blur', blur)
  pageWindow.addEventListener('pagehide', suspend)
  pageWindow.addEventListener('pageshow', resume)

  return () => {
    if (disposed) return
    suspend()
    disposed = true
    pageWindow.clearInterval(heartbeat)
    pageDocument.removeEventListener('visibilitychange', activityChanged)
    pageDocument.removeEventListener('freeze', suspend)
    pageDocument.removeEventListener('resume', resume)
    pageWindow.removeEventListener('focus', activityChanged)
    pageWindow.removeEventListener('blur', blur)
    pageWindow.removeEventListener('pagehide', suspend)
    pageWindow.removeEventListener('pageshow', resume)
  }
}
