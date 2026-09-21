import { useLocale, useMessages } from '../i18n/context'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { historyRangeProblem, historyToday } from '../lib/history'
import { calendarDayLabel, calendarMonthDays, calendarShiftDay, calendarShiftMonth, calendarWeekday } from '../lib/historyCalendar'

export function HistoryDatePicker({ id, initialFrom, initialTo, onApply, onClose }: { id: string; initialFrom: string; initialTo: string; onApply: (from: string, to: string) => void; onClose: () => void }) {
  const locale = useLocale(), t = useMessages()
  const today = historyToday()
  const [from, setFrom] = useState(initialFrom), [to, setTo] = useState(initialTo)
  const [active, setActive] = useState<'from' | 'to'>('from')
  const [month, setMonth] = useState(initialFrom.slice(0, 7))
  const [focusDay, setFocusDay] = useState(initialFrom), [error, setError] = useState('')
  const grid = useRef<HTMLDivElement>(null), captionId = useId()
  const cells = calendarMonthDays(month)
  const tabDay = focusDay.startsWith(month) ? focusDay : `${month}-01`
  const select = (day: string) => {
    setError(''); setFocusDay(day)
    if (active === 'from') { setFrom(day); if (day > to) setTo(day); setActive('to') }
    else setTo(day)
  }
  const moveFocus = (day: string) => {
    const next = day > today ? today : day < '1900-01-01' ? '1900-01-01' : day
    setFocusDay(next); setMonth(next.slice(0, 7))
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus({ preventScroll: true }))
  }
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, day: string) => {
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -calendarWeekday(day), End: 6 - calendarWeekday(day) }[event.key]
    if (offset !== undefined) { event.preventDefault(); moveFocus(calendarShiftDay(day, offset)) }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      const days = calendarMonthDays(calendarShiftMonth(day, event.key === 'PageUp' ? -1 : 1)).filter((value): value is string => value !== null)
      moveFocus(days[Math.min(Number(day.slice(8)), days.length) - 1])
    }
  }
  return <form id={id} className="history-date-picker" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() } }} onSubmit={event => {
    event.preventDefault()
    const problem = historyRangeProblem(from, to, today, locale)
    if (problem) { setError(problem); return }
    onApply(from, to)
  }}>
    <div className="history-date-inputs">
      {(['from', 'to'] as const).map(field => <button key={field} type="button" className="history-date-field" aria-label={t(field === 'from' ? 'history.from' : 'history.to')} aria-pressed={active === field} aria-describedby={error ? `${id}-error` : undefined} onClick={() => {
        const day = field === 'from' ? from : to
        setActive(field); setMonth(day.slice(0, 7)); setFocusDay(day)
      }}><span>{t(field === 'from' ? 'history.from' : 'history.to')}</span><strong>{(field === 'from' ? from : to).replaceAll('-', '.')}</strong></button>)}
      <button type="submit" className="history-date-apply">{t('common.apply')}</button>
    </div>
    <div className="history-calendar">
      <div className="history-calendar-toolbar">
        <strong id={captionId} aria-live="polite">{locale === 'en' ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long' }).format(new Date(`${month}-01T00:00:00Z`)) : `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`}</strong>
        <div><button type="button" aria-label={t('history.previousMonth')} disabled={month <= '1900-01'} onClick={() => setMonth(calendarShiftMonth(`${month}-01`, -1))}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 7-5 5 5 5" /></svg></button><button type="button" aria-label={t('history.nextMonth')} disabled={month >= today.slice(0, 7)} onClick={() => setMonth(calendarShiftMonth(`${month}-01`, 1))}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 7 5 5-5 5" /></svg></button></div>
      </div>
      <div role="grid" aria-labelledby={captionId} ref={grid} className="history-calendar-grid">
        <div role="row" className="history-calendar-weekdays">{(locale === 'en' ? ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] : ['일', '월', '화', '수', '목', '금', '토']).map(day => <span role="columnheader" key={day}>{day}</span>)}</div>
        {Array.from({ length: cells.length / 7 }, (_, week) => <div role="row" key={week}>{cells.slice(week * 7, week * 7 + 7).map((day, column) => <div role="gridcell" key={day ?? `blank-${column}`} aria-selected={day ? day === from || day === to : undefined} className={day ? `${day >= from && day <= to ? 'is-in-range' : ''}${day === from ? ' is-range-start' : ''}${day === to ? ' is-range-end' : ''}` : undefined}>
          {day && <button type="button" data-day={day} aria-label={calendarDayLabel(day, locale)} aria-current={day === today ? 'date' : undefined} disabled={day > today} tabIndex={day === tabDay ? 0 : -1} onFocus={() => setFocusDay(day)} onKeyDown={event => navigate(event, day)} onClick={() => select(day)}>{Number(day.slice(8))}</button>}
        </div>)}</div>)}
      </div>
      <p className="history-calendar-hint" aria-live="polite">{t(active === 'from' ? 'history.chooseFrom' : 'history.chooseTo')}</p>
    </div>
    {error && <p className="history-date-error" id={`${id}-error`} role="alert">{error}</p>}
  </form>
}
