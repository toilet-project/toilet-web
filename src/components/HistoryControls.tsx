import { useEffect, useId, useRef, useState } from 'react'
import { historyRange, historyRangeProblem, historyToday, type HistoryRange } from '../lib/history'
import { historyScroller } from '../lib/useHistoryWindow'
export function HistoryHeading({ title, description, onBack, id }: { title: string; description: string; onBack?: () => void; id?: string }) {
  return <header className="history-heading">{onBack && <button type="button" className="history-back" onClick={onBack} aria-label="내 페이지로 돌아가기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg><span>내 페이지</span></button>}<h1 id={id}>{title}</h1><p>{description}</p></header>
}
export function HistoryFilters({ value, onChange, count }: { value: HistoryRange; onChange: (value: HistoryRange) => void; count: number }) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(value.from), [to, setTo] = useState(value.to)
  const [error, setError] = useState('')
  const id = useId(), root = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null)
  const change = (next: HistoryRange) => {
    onChange(next); setOpen(false); setError('')
    if (root.current) { const scroll = historyScroller(root.current); if (scroll) scroll.scrollTop = 0 }
  }
  return <div className="history-filters" ref={root}>
    <div className="history-periods" role="group" aria-label="조회 기간">
      {(['7', '30', 'all'] as const).map(period => <button type="button" key={period} aria-pressed={value.period === period} onClick={() => change(historyRange(period))}>{period === 'all' ? '전체' : `최근 ${period}일`}</button>)}
      <button type="button" ref={toggle} className="history-date-toggle" aria-label="날짜 직접 선택" title="날짜 직접 선택" aria-expanded={open} aria-controls={id} aria-pressed={value.period === 'custom'} onClick={() => { setFrom(value.from); setTo(value.to); setError(''); setOpen(!open) }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h7m4 0h7M3 17h3m4 0h11" /><circle cx="12" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg></button>
    </div>
    {open && <form id={id} className="history-date-picker" onSubmit={event => { event.preventDefault(); const problem = historyRangeProblem(from, to); if (problem) { setError(problem); return }; change({ period: 'custom', from, to }); toggle.current?.focus() }}>
      <div className="history-date-inputs"><label>시작일<input type="date" value={from} max={historyToday()} onChange={event => setFrom(event.target.value)} aria-describedby={error ? `${id}-error` : undefined} /></label><label>종료일<input type="date" value={to} max={historyToday()} onChange={event => setTo(event.target.value)} aria-describedby={error ? `${id}-error` : undefined} /></label></div>
      {error && <p id={`${id}-error`} role="alert">{error}</p>}
      <div className="history-date-actions"><button type="button" onClick={() => { setOpen(false); toggle.current?.focus() }}>취소</button><button type="submit">적용하기</button></div>
    </form>}
    <div className="history-range-caption"><span>{value.period === 'all' ? '전체 기간' : `${value.from.replaceAll('-', '.')} – ${value.to.replaceAll('-', '.')}`}</span><span>{count}개 · 최신순</span></div>
  </div>
}
export function HistoryMore({ count, total, onMore }: { count: number; total: number; onMore: () => void }) {
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
  return count < total ? <button ref={button} type="button" className="history-more" onClick={onMore}>더 보기 <span>{count} / {total}</span></button> : total > 0 ? <p className="history-end">모든 내역을 확인했어요</p> : null
}
