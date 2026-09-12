import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { TRANSIENT_NOTICE_MS } from '../../lib/uiTiming'

/** Portal avoids clipping by both the single-card and grouped-card scroll containers. */
export function ReviewEntryHint({ anchor, message, id, dismissAfterMs = TRANSIENT_NOTICE_MS }: { anchor: RefObject<HTMLButtonElement | null>; message: string; id: string; dismissAfterMs?: number | null }) {
  const hint = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const dismiss = () => setVisible(false)
    const timer = dismissAfterMs === null ? undefined : setTimeout(dismiss, dismissAfterMs)
    document.addEventListener('pointerdown', dismiss, { once: true })
    document.addEventListener('keydown', dismiss, { once: true })
    return () => { clearTimeout(timer); document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss) }
  }, [dismissAfterMs])
  useLayoutEffect(() => {
    if (!visible || !anchor.current || !hint.current) return
    const button = anchor.current, bubble = hint.current
    const place = () => {
      const rect = button.getBoundingClientRect(), size = bubble.getBoundingClientRect()
      const view = window.visualViewport
      const top = view?.offsetTop ?? 0, left = view?.offsetLeft ?? 0
      const width = view?.width ?? innerWidth, height = view?.height ?? innerHeight
      bubble.style.visibility = rect.bottom <= top || rect.top >= top + height ? 'hidden' : 'visible'
      const x = Math.max(left + 12, Math.min(rect.right - size.width, left + width - size.width - 12))
      const above = rect.top - size.height - 10 >= top + 12
      const y = above ? rect.top - size.height - 10 : rect.bottom + 10
      bubble.style.left = `${x}px`
      bubble.style.top = `${Math.max(top + 12, Math.min(y, top + height - size.height - 12))}px`
      bubble.style.setProperty('--hint-arrow', `${Math.max(12, Math.min(rect.x + rect.width / 2 - x, size.width - 12))}px`)
      bubble.dataset.side = above ? 'above' : 'below'
    }
    place()
    const observer = new ResizeObserver(place); observer.observe(button); observer.observe(bubble)
    window.addEventListener('scroll', place, true); window.addEventListener('resize', place)
    window.visualViewport?.addEventListener('resize', place); window.visualViewport?.addEventListener('scroll', place)
    return () => { observer.disconnect(); window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); window.visualViewport?.removeEventListener('resize', place); window.visualViewport?.removeEventListener('scroll', place) }
  }, [anchor, visible])
  return visible ? createPortal(<div ref={hint} id={id} className="review-entry-hint" role="status">{message}</div>, document.body) : <span id={id} className="sr-only">{message}</span>
}
