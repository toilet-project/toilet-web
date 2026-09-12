import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

const SHOW_AFTER_PX = 400

export function HistoryScrollTop({ container }: { container: RefObject<HTMLElement | null> }) {
  const button = useRef<HTMLButtonElement>(null), [visible, setVisible] = useState(false)
  useLayoutEffect(() => {
    const scroll = container.current
    if (!scroll) return
    const update = () => {
      setVisible(scroll.scrollTop >= SHOW_AFTER_PX)
      const bounds = scroll.getBoundingClientRect()
      button.current?.style.setProperty('--history-top-right', `${window.innerWidth - bounds.right + 16}px`)
      button.current?.style.setProperty('--history-top-bottom', `${window.innerHeight - bounds.bottom + 12}px`)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(scroll)
    scroll.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    return () => { observer.disconnect(); scroll.removeEventListener('scroll', update); window.removeEventListener('resize', update); window.visualViewport?.removeEventListener('resize', update) }
  }, [container])
  return <button ref={button} type="button" className={`history-scroll-top${visible ? ' is-visible' : ''}`} aria-label="맨 위로 이동" title="맨 위로 이동" aria-hidden={!visible} disabled={!visible} tabIndex={visible ? 0 : -1} onClick={() => {
    const scroll = container.current
    if (!scroll) return
    scroll.querySelector<HTMLElement>('.history-heading h1')?.focus({ preventScroll: true })
    scroll.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 6-6 6 6M12 6v13" /></svg><span>TOP</span></button>
}
