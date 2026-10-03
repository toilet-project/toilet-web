import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Locale } from '../i18n/locale'
import { mapFilterCopy } from '../i18n/mapFilterCopy'
import { DEFAULT_MAP_FILTER_ORDER, MAP_FILTER_BITS, promoteMapFilter, readMapFilterOrder,
  setAccessibleGender, setMapFilter, writeMapFilterOrder, type MapFilterKey } from '../lib/mapFilterPreferences'
import './map-filters.css'

const publicFilters = [{ bit: 1, key: 'hours' }, { bit: 2, key: 'cctv' }, { bit: 4, key: 'diaper' }, { bit: 8, key: 'bell' }, { bit: 16, key: 'accessible' }] as const

function Icon({ name }: { name: 'filters' | 'mine' | 'hours' | 'cctv' | 'diaper' | 'bell' | 'accessible' | 'male' | 'female' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'filters' && <><path d="M4 7h7m4 0h5M4 17h3m4 0h9" /><circle cx="13" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>}
    {name === 'mine' && <path d="M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z" />}
    {name === 'hours' && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
    {name === 'cctv' && <><path d="m3 6 14 3-3 7L2 10l1-4Zm14 5 4-1-2 5-3-2M9 14l-1 6H4" /></>}
    {name === 'diaper' && <><path d="M4 7h16l-2 10-6 3-6-3L4 7Zm1 4 4 2-1 5m11-7-4 2 1 5M5 7V4h14v3" /></>}
    {name === 'bell' && <><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3Zm5 3h4M12 2v2" /></>}
    {name === 'accessible' && <><circle cx="11" cy="4" r="2" /><path d="m11 7 1 7h5l3 6 2-1M12 10h5M8 10a6 6 0 1 0 7 9" /></>}
    {name === 'male' && <><circle cx="9" cy="15" r="6" /><path d="m13 11 7-7m-6 0h6v6" /></>}
    {name === 'female' && <><circle cx="12" cy="8" r="6" /><path d="M12 14v8m-4-4h8" /></>}
  </svg>
}

function SelectionMark() {
  return <span className="map-filter-selection-mark" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><path d="m4 8 2.5 2.5L12 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
}

export function MapFilterBar({ locale, flags, mine, onFlagsChange, onMineChange, listButton }: {
  locale: Locale; flags: number; mine: boolean; onFlagsChange: (flags: number) => void; onMineChange: (mine: boolean) => void; listButton?: ReactNode
}) {
  const copy = mapFilterCopy[locale], [open, setOpen] = useState(false)
  const optionsId = useId()
  const root = useRef<HTMLDivElement>(null), strip = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; start: number; scroll: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const [order, setOrder] = useState<MapFilterKey[]>([...DEFAULT_MAP_FILTER_ORDER])
  const previousSelection = useRef({ flags, mine })
  const previousPositions = useRef<Map<string, number> | null>(null)
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try { setOrder(readMapFilterOrder(window.localStorage)) } catch { /* Storage may be blocked. */ }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])
  useLayoutEffect(() => {
    const previous = previousSelection.current
    previousSelection.current = { flags, mine }
    const added = flags & ~previous.flags
    const selected: MapFilterKey | undefined = mine && !previous.mine ? 'mine'
      : added & (16 | 32 | 64) ? 'accessible'
      : publicFilters.find(({ bit }) => (added & bit) !== 0)?.key
    if (!selected) return
    previousPositions.current = new Map(Array.from(strip.current?.querySelectorAll<HTMLButtonElement>('[data-filter-key]') ?? [])
      .map(button => [button.dataset.filterKey!, button.getBoundingClientRect().left]))
    const next = promoteMapFilter(order, selected)
    try { writeMapFilterOrder(window.localStorage, next) } catch { /* Storage may be blocked. */ }
    setOrder(next)
  }, [flags, mine, order])
  useLayoutEffect(() => {
    const positions = previousPositions.current
    previousPositions.current = null
    if (!positions || !strip.current) return
    strip.current.scrollLeft = 0
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const animations = Array.from(strip.current.querySelectorAll<HTMLButtonElement>('[data-filter-key]')).flatMap(button => {
      const before = positions.get(button.dataset.filterKey!)
      const offset = before === undefined ? 0 : before - button.getBoundingClientRect().left
      return offset && button.animate ? [button.animate([{ transform: `translateX(${offset}px)` }, { transform: 'translateX(0)' }],
        { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' })] : []
    })
    return () => animations.forEach(animation => animation.cancel())
  }, [order])
  const accessibleLabel = [copy.accessible, ...(flags & 32 ? [copy.male] : []), ...(flags & 64 ? [copy.female] : [])].join(' · ')
  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLInputElement>('.map-filter-option input')?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLButtonElement>('.map-filter-settings')?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div className="map-filter-toolbar" ref={root}>
    {listButton && <div className="map-filter-list-action">{listButton}</div>}
    <div className="map-filter-controls">
      <div className="map-filter-settings-action">
        <button className={`map-filter-chip map-filter-icon-only map-filter-settings${flags || mine ? ' has-filters' : ''}`} type="button" aria-label={copy.filters} title={copy.filters} aria-expanded={open} aria-controls={optionsId} onClick={() => setOpen(value => !value)}><Icon name="filters" /></button>
      </div>
    <div className="map-filter-scroll" ref={strip} role="group" aria-label={copy.filters}
      onPointerDown={event => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return
        drag.current = { id: event.pointerId, start: event.clientX, scroll: event.currentTarget.scrollLeft, moved: false }
        suppressClick.current = false
      }}
      onPointerMove={event => {
        const active = drag.current
        if (!active || active.id !== event.pointerId) return
        if (Math.abs(event.clientX - active.start) > 5) {
          active.moved = true; suppressClick.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
          event.currentTarget.scrollLeft = active.scroll - (event.clientX - active.start)
        }
      }}
      onPointerUp={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        drag.current = null
        window.setTimeout(() => { suppressClick.current = false }, 0)
      }}
      onPointerLeave={() => { if (!drag.current?.moved) drag.current = null }}
      onLostPointerCapture={() => { drag.current = null }}
      onPointerCancel={() => { drag.current = null; suppressClick.current = false }}
      onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false } }}>
      <div className="map-filter-chips">
        {order.map(key => key === 'mine'
          ? <button className="map-filter-chip" key={key} data-filter-key={key} data-filter-tone={key} type="button" aria-pressed={mine} title={copy.member} onClick={() => onMineChange(!mine)}><Icon name="mine" /><span>{copy.mine}</span></button>
          : <button className={`map-filter-chip${key === 'accessible' ? ` map-filter-accessible${flags & 96 ? ' has-genders' : ' map-filter-icon-only'}` : ''}`} key={key} data-filter-key={key} data-filter-tone={key} type="button" aria-label={key === 'accessible' ? accessibleLabel : copy[key]} title={key === 'accessible' ? accessibleLabel : copy[key]} aria-pressed={(flags & MAP_FILTER_BITS[key]) !== 0} onClick={() => onFlagsChange(setMapFilter(flags, key, !(flags & MAP_FILTER_BITS[key])))}>
            <Icon name={key} />{key !== 'accessible' ? <span>{copy[key]}</span> : flags & 96 ? <span className="map-filter-gender-icons" aria-hidden="true">{(flags & 32) !== 0 && <Icon name="male" />}{(flags & 64) !== 0 && <Icon name="female" />}</span> : null}
          </button>)}
      </div>
    </div>
      {open && <div className="map-filter-options" id={optionsId} role="group" aria-label={copy.filters}>
        <div className="map-filter-options-header"><strong>{copy.filters}</strong><button type="button" disabled={!flags && !mine} onClick={() => { onFlagsChange(0); onMineChange(false) }}>{copy.clearAll}</button></div>
        <div className="map-filter-options-grid">
          <label className="map-filter-option" data-filter-tone="mine" title={copy.member}><span className="map-filter-option-icon"><Icon name="mine" /></span><span className="map-filter-option-label">{copy.mine}</span><input type="checkbox" checked={mine} onChange={event => onMineChange(event.target.checked)} /><SelectionMark /></label>
          {publicFilters.map(({ bit, key }) => <label className="map-filter-option" data-filter-tone={key} key={key}><span className="map-filter-option-icon"><Icon name={key} /></span><span className="map-filter-option-label">{copy[key]}</span><input type="checkbox" checked={(flags & bit) === bit} onChange={event => onFlagsChange(setMapFilter(flags, key, event.target.checked))} /><SelectionMark /></label>)}
        </div>
        <div className="map-filter-accessibility-options" data-filter-tone="accessible">
        <div className="map-filter-gender-heading" aria-hidden="true"><Icon name="accessible" /><span>{copy.accessible}</span></div>
        <div className="map-filter-genders" role="group" aria-label={copy.accessible}>
          {(['male', 'female'] as const).map(gender => <label className="map-filter-gender-option" key={gender}>
            <Icon name={gender} /><span>{copy[gender]}</span><input type="checkbox" checked={(flags & (gender === 'male' ? 32 : 64)) !== 0}
              onChange={event => onFlagsChange(setAccessibleGender(flags, gender, event.target.checked))} /><SelectionMark />
          </label>)}
        </div>
        </div>
      </div>}
    </div>
  </div>
}
