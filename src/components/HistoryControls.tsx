import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { historyRange, type HistoryRange } from '../lib/history'
import { historyScroller } from '../lib/useHistoryWindow'
import { HistoryDatePicker } from './HistoryDatePicker'
export function HistoryHeading({ title, onClose, id }: { title: string; onClose?: () => void; id?: string }) {
  return <header className="history-heading"><div className="history-title-row"><h1 id={id} tabIndex={-1}>{title}</h1>{onClose && <button type="button" className="history-close" onClick={onClose} aria-label={`${title} 닫기`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>}</div></header>
}
export function HistoryFilters({ value, onChange, count, countLabel, embedded = false, children }: { value: HistoryRange; onChange: (value: HistoryRange) => void; count: number; countLabel?: string; embedded?: boolean; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId(), root = useRef<HTMLDivElement>(null), periods = useRef<HTMLDivElement>(null), calendar = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    if (!embedded || !root.current) return
    const scroll = historyScroller(root.current)
    if (!scroll) return
    const update = () => {
      if (!root.current || !periods.current) return
      // Only the calendar floats; filter controls stay at the start of the scroll content.
      const row = periods.current.getBoundingClientRect(), viewport = scroll.getBoundingClientRect()
      root.current.style.setProperty('--history-calendar-top', `${row.bottom + 8}px`)
      root.current.style.setProperty('--history-calendar-left', `${viewport.left}px`)
      root.current.style.setProperty('--history-calendar-width', `${viewport.width}px`)
      root.current.style.setProperty('--history-calendar-max-height', `${Math.max(0, viewport.bottom - row.bottom - 16)}px`)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(root.current)
    observer.observe(scroll)
    scroll.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    return () => { observer.disconnect(); scroll.removeEventListener('scroll', update); window.removeEventListener('resize', update); window.visualViewport?.removeEventListener('resize', update) }
  }, [embedded])
  useEffect(() => {
    if (!open || !root.current) return
    const scroll = historyScroller(root.current), startingScroll = scroll?.scrollTop ?? 0
    const close = () => setOpen(false)
    const outside = (event: Event) => { if (!calendar.current?.contains(event.target as Node) && !toggle.current?.contains(event.target as Node)) close() }
    const onScroll = () => { if (scroll && Math.abs(scroll.scrollTop - startingScroll) > 8) close() }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    if (embedded) scroll?.addEventListener('scroll', onScroll, { passive: true })
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', outside); if (embedded) scroll?.removeEventListener('scroll', onScroll) }
  }, [embedded, open])
  const change = (next: HistoryRange) => {
    onChange(next); setOpen(false)
    if (root.current) { const scroll = historyScroller(root.current); if (scroll) scroll.scrollTop = 0 }
  }
  const rangeLabel = value.period === 'all' ? '전체 기간' : `${value.from.replaceAll('-', '.')} – ${value.to.replaceAll('-', '.')}`
  return <div className={`history-filter-shell${embedded ? ' is-embedded' : ''}`} ref={root} onKeyDown={event => {
    if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); toggle.current?.focus({ preventScroll: true }); setOpen(false) }
  }}>
    <div className="history-filters">
      <div ref={periods} className="history-periods" role="group" aria-label="조회 기간">
        {(['7', '30', 'all'] as const).map(period => <button type="button" key={period} aria-pressed={value.period === period} onClick={() => change(historyRange(period))}>{period === 'all' ? '전체' : `최근 ${period}일`}</button>)}
        <button type="button" ref={toggle} className="history-date-toggle" aria-label="날짜 직접 선택" title={open ? '날짜 선택 닫기' : '날짜 직접 선택'} aria-expanded={open} aria-controls={`${id}-dates`} aria-pressed={value.period === 'custom'} onClick={() => setOpen(!open)}><svg viewBox="0 0 24 24" aria-hidden="true">{open ? <path d="m6 15 6-6 6 6" /> : <><path d="M3 7h7m4 0h7M3 17h3m4 0h11" /><circle cx="12" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>}</svg></button>
      </div>
      {open && <div ref={calendar} className="history-date-popover"><HistoryDatePicker id={`${id}-dates`} initialFrom={value.from} initialTo={value.to} onApply={(from, to) => { change({ period: 'custom', from, to }); toggle.current?.focus({ preventScroll: true }) }} onClose={() => { setOpen(false); toggle.current?.focus({ preventScroll: true }) }} /></div>}
      <div className="history-range-caption"><span>{rangeLabel}</span><span>{countLabel ?? `${count}개 · 최신순`}</span></div>
    </div>
    {children}
  </div>
}
export function HistoryMore({ count, total, onMore, label }: { count: number; total: number; onMore: () => void; label?: string }) {
  const button = useRef<HTMLButtonElement>(null)
  const latest = useRef(onMore)
  useEffect(() => { latest.current = onMore }, [onMore])
  useEffect(() => {
    if (count >= total || !button.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); latest.current() }
    }, { root: historyScroller(button.current), rootMargin: '0px 0px 100px 0px' })
    observer.observe(button.current)
    return () => observer.disconnect()
  }, [count, total])
  return count < total ? <button ref={button} type="button" className="history-more" onClick={onMore}>{label ?? <>더 보기 <span>{count} / {total}</span></>}</button> : total > 0 ? <p className="history-end">모든 내역을 확인했어요</p> : null
}
