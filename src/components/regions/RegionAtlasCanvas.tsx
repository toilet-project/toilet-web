'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type FocusEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { constrainAtlas, initialAtlasViewport, zoomAtlas, type AtlasPoint, type AtlasViewport } from '../../lib/regionAtlasViewport'
import { placeAtlasLabels } from '../../lib/atlasLabelLayout'

type Area = { code: string; name: string; mapName: string; emphasized: boolean; count: string; href: string; path: string; anchor: [number, number]; alternatives: [number, number][]; color: string; surface: number; regionWidth: number }
type Selection = { area: Area; x: number; y: number }
type Pointer = AtlasPoint & { clientX: number; clientY: number }

export function RegionAtlasCanvas({ areas, width, height, label, countLabel, zoomInLabel, zoomOutLabel, resetLabel, detailHint, allRegionsLabel, closeLabel, overview }: {
  areas: Area[]; width: number; height: number; label: string; countLabel: string
  zoomInLabel: string; zoomOutLabel: string; resetLabel: string; detailHint: string
  allRegionsLabel: string; closeLabel: string
  overview: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const picker = useRef<HTMLDetailsElement>(null)
  const pickerId = useId()
  const svg = useRef<SVGSVGElement>(null)
  const router = useRouter()
  const pointerType = useRef('mouse')
  const pointers = useRef(new Map<number, Pointer>())
  const dragged = useRef(false)
  const viewRef = useRef<AtlasViewport>(initialAtlasViewport)
  const [view, setView] = useState(initialAtlasViewport)
  const [isDragging, setIsDragging] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [nameWidths, setNameWidths] = useState<Record<string, number>>({})
  const [size, setSize] = useState({ width, height })
  const labelSize = overview ? 17 : 15
  useEffect(() => {
    if (!svg.current) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(svg.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let cancelled = false
    function measure() {
      const context = document.createElement('canvas').getContext('2d')
      if (!context || !root.current || cancelled) return
      context.font = `400 ${labelSize}px ${getComputedStyle(root.current).fontFamily}`
      setNameWidths(Object.fromEntries(areas.map(area => [area.code, Math.ceil(context.measureText(area.mapName).width) + 8])))
    }
    void document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    return () => { cancelled = true; document.fonts.removeEventListener('loadingdone', measure) }
  }, [areas, labelSize])
  useEffect(() => {
    if (!pickerOpen) return
    function outside(event: globalThis.PointerEvent) {
      if (event.target instanceof Node && !picker.current?.contains(event.target)) {
        if (picker.current) picker.current.open = false
        setSelection(null)
      }
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [pickerOpen])
  function closePicker(restoreFocus = true) {
    if (picker.current) picker.current.open = false
    setSelection(null)
    if (restoreFocus) picker.current?.querySelector('summary')?.focus()
  }
  const fit = Math.min(size.width / width, size.height / height) || 1
  const offset = { x: (size.width - width * fit) / 2, y: (size.height - height * fit) / 2 }
  const showCounts = view.scale >= 1.5
  const labels = useMemo(() => placeAtlasLabels([...areas].sort((a, b) => overview ? a.surface - b.surface : b.surface - a.surface).map(area => ({ code: area.code,
    x: (area.anchor[0] * view.scale + view.x) * fit + offset.x,
    y: (area.anchor[1] * view.scale + view.y) * fit + offset.y,
    width: Math.max(32, nameWidths[area.code] ?? [...area.mapName].reduce((sum, letter) => sum + (letter.codePointAt(0)! > 127 ? labelSize : labelSize * .55), 8)),
    height: showCounts ? 41 : overview ? 23 : 25,
    priority: area.emphasized ? 1 : 0,
    alternatives: area.alternatives.map(([x, y]) => ({ x: (x * view.scale + view.x) * fit + offset.x, y: (y * view.scale + view.y) * fit + offset.y })),
    availableArea: area.surface * (view.scale * fit) ** 2,
    regionWidth: area.regionWidth * view.scale * fit,
  })), size.width, size.height, !overview), [areas, view, fit, offset.x, offset.y, size, nameWidths, showCounts, overview, labelSize])
  const changeView = useCallback((next: AtlasViewport) => {
    viewRef.current = next
    setView(next)
    setSelection(null)
  }, [])
  function point(clientX: number, clientY: number): Pointer {
    const matrix = svg.current?.getScreenCTM()
    const mapped = matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : { x: width / 2, y: height / 2 }
    return { x: mapped.x, y: mapped.y, clientX, clientY }
  }
  useEffect(() => {
    const element = svg.current
    if (!element) return
    function wheel(event: WheelEvent) {
      event.preventDefault()
      const matrix = element!.getScreenCTM()
      if (!matrix) return
      const origin = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 300 : 1)
      changeView(zoomAtlas(viewRef.current, viewRef.current.scale * Math.exp(-Math.max(-300, Math.min(300, delta)) * .002), origin, width, height))
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [width, height, changeView])
  function zoom(factor: number) { changeView(zoomAtlas(viewRef.current, viewRef.current.scale * factor, { x: width / 2, y: height / 2 }, width, height)) }
  function position(area: Area, clientX: number, clientY: number) {
    const bounds = root.current?.getBoundingClientRect()
    if (!bounds) return
    setSelection({ area, x: Math.max(12, Math.min(clientX - bounds.left + 18, bounds.width - 218)), y: Math.max(12, Math.min(clientY - bounds.top - 24, bounds.height - 116)) })
  }
  function hover(event: PointerEvent<Element>, area: Area) {
    if (event.pointerType !== 'touch' && pointers.current.size === 0) position(area, event.clientX, event.clientY)
  }
  function focus(event: FocusEvent<Element>, area: Area) {
    if (pointerType.current === 'touch') return
    const bounds = event.currentTarget.getBoundingClientRect()
    position(area, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  }
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return
    pointerType.current = event.pointerType
    if (pointers.current.size === 0) dragged.current = false
    pointers.current.set(event.pointerId, point(event.clientX, event.clientY))
    if (pointers.current.size > 1) { dragged.current = true; setSelection(null) }
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    const next = point(event.clientX, event.clientY)
    if (!dragged.current && Math.hypot(next.clientX - previous.clientX, next.clientY - previous.clientY) < 5) return
    dragged.current = true
    setIsDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1]
    if (other) {
      const distance = Math.hypot(previous.x - other.x, previous.y - other.y)
      const nextDistance = Math.hypot(next.x - other.x, next.y - other.y)
      if (distance > 0) changeView(zoomAtlas(viewRef.current, viewRef.current.scale * nextDistance / distance,
        { x: (previous.x + other.x) / 2, y: (previous.y + other.y) / 2 }, width, height,
        { x: (next.x + other.x) / 2, y: (next.y + other.y) / 2 }))
    } else changeView(constrainAtlas({ ...viewRef.current, x: viewRef.current.x + next.x - previous.x, y: viewRef.current.y + next.y - previous.y }, width, height))
    pointers.current.set(event.pointerId, next)
  }
  function pointerEnd(event: PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (pointers.current.size === 0) setIsDragging(false)
  }
  return <div ref={root} className={`region-atlas-wrap${isDragging ? ' is-dragging' : ''}`} style={{ '--atlas-height': `${size.height}px` } as CSSProperties} onPointerLeave={event => { if (event.pointerType !== 'touch') setSelection(null) }} onKeyDownCapture={event => { pointerType.current = 'keyboard'; if (event.key === 'Escape' && pickerOpen) { event.preventDefault(); closePicker() } }} onBlur={event => {
    // Touch browsers can blur the summary with no next focus target before the
    // link receives its click. Only close on an actual focus move outside.
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) { setSelection(null); closePicker(false) }
  }}>
    <svg ref={svg} className="region-atlas" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={label}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
      onLostPointerCapture={event => { if (event.target === event.currentTarget) { pointers.current.delete(event.pointerId); if (pointers.current.size === 0) setIsDragging(false) } }}
      onPointerLeave={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) pointerEnd(event) }}
      onClickCapture={event => { if (dragged.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation() } }}
      onKeyDown={event => { if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.5) } else if (event.key === '-') { event.preventDefault(); zoom(1 / 1.5) } else if (event.key === '0') { event.preventDefault(); changeView(initialAtlasViewport) } }}>
      <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
        {areas.map(area => <a key={area.code} href={area.href} style={{ '--region-color': area.color } as CSSProperties} className={`region-atlas-area${area.emphasized ? ' is-emphasized' : ''}${selection?.area.code === area.code ? ' is-active' : ''}`} aria-label={`${area.name} · ${area.count} ${countLabel}`}
          onPointerMove={event => hover(event, area)} onPointerEnter={event => hover(event, area)} onFocus={event => focus(event, area)}
          onClick={event => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            event.preventDefault()
            router.push(area.href)
          }}>
          <path d={area.path} fillRule="evenodd" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </a>)}
      </g>
      <g className="region-atlas-labels" transform={`translate(${-offset.x / fit} ${-offset.y / fit}) scale(${1 / fit})`}>
        {labels.map(item => { const area = areas.find(area => area.code === item.code)!; return <foreignObject key={area.code} x={item.left} y={item.top} width={item.width} height={item.height}>
          <a href={area.href} className={`region-atlas-label${area.emphasized ? ' is-emphasized' : ''}${selection?.area.code === area.code ? ' is-active' : ''}`} style={{ '--atlas-label-size': `${labelSize}px` } as CSSProperties}
            aria-label={`${area.name} · ${area.count} ${countLabel}`} title={`${area.name} · ${area.count} ${countLabel}`} tabIndex={-1}
            onPointerEnter={event => hover(event, area)}
            onClick={event => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); router.push(area.href) } }}>
            <strong>{area.mapName}</strong>{showCounts && <span>{area.count}</span>}
          </a>
        </foreignObject> })}
      </g>
    </svg>
    {selection && !pickerOpen && <div className="region-atlas-tooltip" style={{ left: selection.x, top: selection.y }} role="status">
      <span className="region-atlas-tooltip-name">{selection.area.name}</span><div><strong>{selection.area.count}</strong><span>{countLabel}</span></div>
    </div>}
    <details ref={picker} className="region-atlas-picker" onToggle={event => setPickerOpen(event.currentTarget.open)}>
      <summary aria-controls={pickerId} aria-expanded={pickerOpen}>{allRegionsLabel}<span>{areas.length}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></summary>
      <section id={pickerId} className="region-atlas-picker-panel" aria-label={allRegionsLabel}>
        <div className="region-atlas-picker-heading"><strong>{label}</strong><button type="button" onClick={() => closePicker()} aria-label={closeLabel}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
        <div className="region-atlas-picker-list">{areas.map(area => <Link key={area.code} href={area.href} prefetch={false} onNavigate={() => closePicker(false)}>
          <strong>{area.name}</strong><span aria-label={`${area.count} ${countLabel}`}>{area.count}</span>
        </Link>)}</div>
      </section>
    </details>
    <div className="region-atlas-controls">
      <button type="button" onClick={() => zoom(1.5)} disabled={view.scale >= 8} aria-label={zoomInLabel} title={zoomInLabel}><span aria-hidden="true">+</span></button>
      <button type="button" onClick={() => zoom(1 / 1.5)} disabled={view.scale <= 1} aria-label={zoomOutLabel} title={zoomOutLabel}><span aria-hidden="true">−</span></button>
      <button type="button" onClick={() => changeView(initialAtlasViewport)} aria-label={resetLabel} title={resetLabel}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg></button>
    </div>
    <span className="region-atlas-caption">{detailHint}</span>
  </div>
}
