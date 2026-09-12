import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { historyRange, type HistoryRange } from '../lib/history'
import { historyScroller } from '../lib/useHistoryWindow'
import { HistoryDatePicker } from './HistoryDatePicker'
export function HistoryHeading({ title, onClose, id }: { title: string; onClose?: () => void; id?: string }) {
  return <header className="history-heading"><div className="history-title-row"><h1 id={id}>{title}</h1>{onClose && <button type="button" className="history-close" onClick={onClose} aria-label={`${title} 닫기`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>}</div></header>
}
export function HistoryFilters({ value, onChange, count, countLabel, collapsible = false, children }: { value: HistoryRange; onChange: (value: HistoryRange) => void; count: number; countLabel?: string; collapsible?: boolean; children?: ReactNode }) {
  const [manuallyHidden, setManuallyHidden] = useState(false), [scrolledOut, setScrolledOut] = useState(false), [open, setOpen] = useState(false)
  const expanded = !manuallyHidden && !scrolledOut
  const id = useId(), root = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null), disclosure = useRef<HTMLButtonElement>(null), toggle = useRef<HTMLButtonElement>(null)
  const revealAt = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (!collapsible || !root.current) return
    const scroll = historyScroller(root.current)
    if (!scroll) return
    const update = () => {
      if (!root.current || !body.current || !disclosure.current) return
      // Keep the body in document flow: scrolling must never shrink the list.
      const height = body.current.offsetHeight
      const travel = revealAt.current === null ? height : Math.min(height, Math.max(0, scroll.scrollTop - revealAt.current))
      root.current.style.setProperty('--history-filter-travel', `${travel}px`)
      setScrolledOut(height > 0 && body.current.getBoundingClientRect().bottom <= disclosure.current.getBoundingClientRect().bottom + 1)
    }
    update()
    const observer = new ResizeObserver(update)
    if (body.current) observer.observe(body.current)
    observer.observe(scroll)
    scroll.addEventListener('scroll', update, { passive: true })
    return () => { observer.disconnect(); scroll.removeEventListener('scroll', update) }
  }, [collapsible, manuallyHidden])
  const toggleFilters = () => {
    if (expanded) { setManuallyHidden(true); setOpen(false) }
    else {
      revealAt.current = root.current ? historyScroller(root.current)?.scrollTop ?? 0 : 0
      root.current?.style.setProperty('--history-filter-travel', '0px')
      setManuallyHidden(false); setScrolledOut(false)
    }
  }
  const change = (next: HistoryRange) => {
    onChange(next); setOpen(false); setManuallyHidden(false); revealAt.current = null
    if (root.current) { const scroll = historyScroller(root.current); if (scroll) scroll.scrollTop = 0 }
  }
  const rangeLabel = value.period === 'all' ? '전체 기간' : `${value.from.replaceAll('-', '.')} – ${value.to.replaceAll('-', '.')}`
  return <div className={`history-filter-shell${collapsible ? ' is-collapsible' : ''}${expanded ? ' is-expanded' : ' is-collapsed'}`} ref={root}>
    {collapsible && <button type="button" ref={disclosure} className="history-filter-disclosure" aria-expanded={expanded} aria-controls={`${id}-filters`} onClick={toggleFilters}><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>필터</span><small>{value.period === 'all' ? '전체 기간' : value.period === 'custom' ? `${value.from.slice(5).replace('-', '.')} – ${value.to.slice(5).replace('-', '.')}` : `최근 ${value.period}일`}</small><svg className="history-filter-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button>}
    <div ref={body} id={`${id}-filters`} className="history-filter-body" hidden={collapsible && manuallyHidden} aria-hidden={collapsible && !expanded} inert={collapsible && !expanded ? true : undefined}>
      <div className="history-filter-body-inner">
        <div className="history-filters">
          <div className="history-periods" role="group" aria-label="조회 기간">
            {(['7', '30', 'all'] as const).map(period => <button type="button" key={period} aria-pressed={value.period === period} onClick={() => change(historyRange(period))}>{period === 'all' ? '전체' : `최근 ${period}일`}</button>)}
            <button type="button" ref={toggle} className="history-date-toggle" aria-label="날짜 직접 선택" title={open ? '날짜 선택 닫기' : '날짜 직접 선택'} aria-expanded={open} aria-controls={`${id}-dates`} aria-pressed={value.period === 'custom'} onClick={() => setOpen(!open)}><svg viewBox="0 0 24 24" aria-hidden="true">{open ? <path d="m6 15 6-6 6 6" /> : <><path d="M3 7h7m4 0h7M3 17h3m4 0h11" /><circle cx="12" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>}</svg></button>
          </div>
          {open && <HistoryDatePicker id={`${id}-dates`} initialFrom={value.from} initialTo={value.to} onApply={(from, to) => { change({ period: 'custom', from, to }); toggle.current?.focus({ preventScroll: true }) }} onClose={() => { setOpen(false); toggle.current?.focus({ preventScroll: true }) }} />}
          <div className="history-range-caption"><span>{rangeLabel}</span><span>{countLabel ?? `${count}개 · 최신순`}</span></div>
        </div>
        {children}
      </div>
    </div>
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
