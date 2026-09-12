import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { historyRange, historyRangeProblem, historyToday, type HistoryRange } from '../lib/history'
import { historyScroller } from '../lib/useHistoryWindow'
export function HistoryHeading({ title, description, onClose, id }: { title: string; description?: string; onClose?: () => void; id?: string }) {
  return <><header className="history-heading"><div className="history-title-row"><h1 id={id}>{title}</h1>{onClose && <button type="button" className="history-close" onClick={onClose} aria-label={`${title} 닫기`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>}</div></header>{description && <p className="history-heading-description">{description}</p>}</>
}
export function HistoryFilters({ value, onChange, count, countLabel, collapsible = false, children }: { value: HistoryRange; onChange: (value: HistoryRange) => void; count: number; countLabel?: string; collapsible?: boolean; children?: ReactNode }) {
  const [expanded, setExpanded] = useState(true), [open, setOpen] = useState(false)
  const [from, setFrom] = useState(value.from), [to, setTo] = useState(value.to)
  const [error, setError] = useState('')
  const id = useId(), root = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null), lastScroll = useRef(0), manuallyExpanded = useRef(false)
  useEffect(() => {
    if (!collapsible || !root.current) return
    const scroll = historyScroller(root.current)
    if (!scroll) return
    lastScroll.current = scroll.scrollTop
    const collapse = () => {
      const next = scroll.scrollTop
      if (!manuallyExpanded.current && next > 72 && next > lastScroll.current + 8) { setExpanded(false); setOpen(false); setError('') }
      lastScroll.current = next
    }
    const allowCollapse = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) manuallyExpanded.current = false
    }
    scroll.addEventListener('scroll', collapse, { passive: true })
    document.addEventListener('pointerdown', allowCollapse)
    document.addEventListener('keydown', allowCollapse)
    return () => { scroll.removeEventListener('scroll', collapse); document.removeEventListener('pointerdown', allowCollapse); document.removeEventListener('keydown', allowCollapse) }
  }, [collapsible])
  const change = (next: HistoryRange) => {
    onChange(next); setOpen(false); setError('')
    if (root.current) { const scroll = historyScroller(root.current); if (scroll) scroll.scrollTop = 0 }
  }
  const rangeLabel = value.period === 'all' ? '전체 기간' : `${value.from.replaceAll('-', '.')} – ${value.to.replaceAll('-', '.')}`
  return <div className={`history-filter-shell${collapsible ? ' is-collapsible' : ''}`} ref={root}>
    {collapsible && <button type="button" className="history-filter-disclosure" aria-expanded={expanded} aria-controls={`${id}-filters`} onClick={() => { const next = !expanded; manuallyExpanded.current = next; setExpanded(next); if (!next) { setOpen(false); setError('') } }}><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>필터</span><small>{rangeLabel}</small><svg className="history-filter-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg></button>}
    <div id={`${id}-filters`} className="history-filter-body" hidden={collapsible && !expanded}>
      <div className="history-filters">
        <div className="history-periods" role="group" aria-label="조회 기간">
          {(['7', '30', 'all'] as const).map(period => <button type="button" key={period} aria-pressed={value.period === period} onClick={() => change(historyRange(period))}>{period === 'all' ? '전체' : `최근 ${period}일`}</button>)}
          <button type="button" ref={toggle} className="history-date-toggle" aria-label="날짜 직접 선택" title={open ? '날짜 선택 닫기' : '날짜 직접 선택'} aria-expanded={open} aria-controls={`${id}-dates`} aria-pressed={value.period === 'custom'} onClick={() => { setFrom(value.from); setTo(value.to); setError(''); setOpen(!open) }}><svg viewBox="0 0 24 24" aria-hidden="true">{open ? <path d="m6 15 6-6 6 6" /> : <><path d="M3 7h7m4 0h7M3 17h3m4 0h11" /><circle cx="12" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>}</svg></button>
        </div>
        {open && <form id={`${id}-dates`} className="history-date-picker" onSubmit={event => { event.preventDefault(); const problem = historyRangeProblem(from, to); if (problem) { setError(problem); return }; change({ period: 'custom', from, to }); toggle.current?.focus() }}>
          <div className="history-date-inputs"><label><span className="sr-only">시작일</span><input aria-label="시작일" type="date" value={from} max={historyToday()} onChange={event => setFrom(event.target.value)} aria-describedby={error ? `${id}-error` : undefined} /></label><span aria-hidden="true">–</span><label><span className="sr-only">종료일</span><input aria-label="종료일" type="date" value={to} max={historyToday()} onChange={event => setTo(event.target.value)} aria-describedby={error ? `${id}-error` : undefined} /></label><button type="submit">적용</button></div>
          {error && <p id={`${id}-error`} role="alert">{error}</p>}
        </form>}
        <div className="history-range-caption"><span>{rangeLabel}</span><span>{countLabel ?? `${count}개 · 최신순`}</span></div>
      </div>
      {children}
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
