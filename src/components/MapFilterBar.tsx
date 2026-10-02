import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Locale } from '../i18n/locale'
import { mapFilterCopy } from '../i18n/mapFilterCopy'
import './map-filters.css'

function Icon({ name }: { name: 'filters' | 'mine' | 'hours' | 'cctv' | 'diaper' | 'bell' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'filters' && <><path d="M4 7h7m4 0h5M4 17h3m4 0h9" /><circle cx="13" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>}
    {name === 'mine' && <path d="M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z" />}
    {name === 'hours' && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
    {name === 'cctv' && <><path d="m3 6 14 3-3 7L2 10l1-4Zm14 5 4-1-2 5-3-2M9 14l-1 6H4" /></>}
    {name === 'diaper' && <><path d="M4 7h16l-2 10-6 3-6-3L4 7Zm1 4 4 2-1 5m11-7-4 2 1 5M5 7V4h14v3" /></>}
    {name === 'bell' && <><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3Zm5 3h4M12 2v2" /></>}
  </svg>
}

export function MapFilterBar({ locale, flags, mine, onFlagsChange, onMineChange, listButton }: {
  locale: Locale; flags: number; mine: boolean; onFlagsChange: (flags: number) => void; onMineChange: (mine: boolean) => void; listButton?: ReactNode
}) {
  const copy = mapFilterCopy[locale], [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null), strip = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; start: number; scroll: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLButtonElement>('.map-filter-settings')?.focus() } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div className="map-filter-toolbar" ref={root}>
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
        <button className={`map-filter-chip map-filter-settings${flags || mine ? ' has-filters' : ''}`} type="button" aria-label={copy.filters} title={copy.filters} aria-expanded={open} aria-controls="map-filter-options" onClick={() => setOpen(value => !value)}><Icon name="filters" /></button>
        <button className="map-filter-chip" type="button" aria-pressed={mine} title={copy.member} onClick={() => onMineChange(!mine)}><Icon name="mine" /><span>{copy.mine}</span></button>
        {([{ bit: 1, key: 'hours' }, { bit: 2, key: 'cctv' }, { bit: 4, key: 'diaper' }, { bit: 8, key: 'bell' }] as const).map(({ bit, key }) =>
          <button className="map-filter-chip" key={key} type="button" aria-pressed={(flags & bit) === bit} onClick={() => onFlagsChange(flags ^ bit)}><Icon name={key} /><span>{copy[key]}</span></button>)}
      </div>
    </div>
    {listButton && <div className="map-filter-list-action">{listButton}</div>}
    {open && <div className="map-filter-options" id="map-filter-options"><p>{copy.explanation}</p><button type="button" disabled={!flags && !mine} onClick={() => { onFlagsChange(0); onMineChange(false); setOpen(false) }}>{copy.reset}</button></div>}
  </div>
}
