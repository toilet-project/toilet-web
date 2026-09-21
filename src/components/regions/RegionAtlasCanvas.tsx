'use client'

import { useCallback, useEffect, useRef, useState, type PointerEvent, type FocusEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { constrainAtlas, initialAtlasViewport, zoomAtlas, type AtlasPoint, type AtlasViewport } from '../../lib/regionAtlasViewport'

type Area = { code: string; name: string; count: string; href: string; path: string }
type Selection = { area: Area; x: number; y: number; touch: boolean }
type Pointer = AtlasPoint & { clientX: number; clientY: number }

export function RegionAtlasCanvas({ areas, width, height, label, countLabel, enterLabel, zoomInLabel, zoomOutLabel, resetLabel }: {
  areas: Area[]; width: number; height: number; label: string; countLabel: string; enterLabel: string
  zoomInLabel: string; zoomOutLabel: string; resetLabel: string
}) {
  const root = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const router = useRouter()
  const pointerType = useRef('mouse')
  const pointers = useRef(new Map<number, Pointer>())
  const dragged = useRef(false)
  const viewRef = useRef<AtlasViewport>(initialAtlasViewport)
  const [view, setView] = useState(initialAtlasViewport)
  const [isDragging, setIsDragging] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)
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
  function position(area: Area, clientX: number, clientY: number, touch = false) {
    const bounds = root.current?.getBoundingClientRect()
    if (!bounds) return
    setSelection({ area, touch, x: Math.max(12, Math.min(clientX - bounds.left + 18, bounds.width - 218)), y: Math.max(12, Math.min(clientY - bounds.top - 24, bounds.height - 116)) })
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
  return <div ref={root} className={`region-atlas-wrap${isDragging ? ' is-dragging' : ''}`} onPointerLeave={event => { if (event.pointerType !== 'touch') setSelection(null) }} onKeyDownCapture={() => { pointerType.current = 'keyboard' }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSelection(null) }}>
    <svg ref={svg} className="region-atlas" viewBox={`0 0 ${width} ${height}`} role="group" aria-label={label}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
      onLostPointerCapture={event => { if (event.target === event.currentTarget) { pointers.current.delete(event.pointerId); if (pointers.current.size === 0) setIsDragging(false) } }}
      onPointerLeave={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) pointerEnd(event) }}
      onClickCapture={event => { if (dragged.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation() } }}
      onKeyDown={event => { if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.5) } else if (event.key === '-') { event.preventDefault(); zoom(1 / 1.5) } else if (event.key === '0') { event.preventDefault(); changeView(initialAtlasViewport) } }}>
      <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
        {areas.map(area => <a key={area.code} href={area.href} className={`region-atlas-area${selection?.area.code === area.code ? ' is-active' : ''}`} aria-label={`${area.name} · ${area.count} ${countLabel}`}
          onPointerMove={event => hover(event, area)} onPointerEnter={event => hover(event, area)} onFocus={event => focus(event, area)}
          onClick={event => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
            event.preventDefault()
            if (pointerType.current === 'touch' && selection?.area.code !== area.code) position(area, event.clientX, event.clientY, true)
            else router.push(area.href)
          }}>
          <path d={area.path} fillRule="evenodd" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </a>)}
      </g>
    </svg>
    {selection && <div className={`region-atlas-tooltip${selection.touch ? ' is-touch' : ''}`} style={selection.touch ? undefined : { left: selection.x, top: selection.y }} role="status">
      <span className="region-atlas-tooltip-name">{selection.area.name}</span><div><strong>{selection.area.count}</strong><span>{countLabel}</span></div>
      {selection.touch && <Link href={selection.area.href}>{enterLabel}<span aria-hidden="true">↗</span></Link>}
    </div>}
    <div className="region-atlas-controls">
      <button type="button" onClick={() => zoom(1.5)} disabled={view.scale >= 8} aria-label={zoomInLabel} title={zoomInLabel}><span aria-hidden="true">+</span></button>
      <button type="button" onClick={() => zoom(1 / 1.5)} disabled={view.scale <= 1} aria-label={zoomOutLabel} title={zoomOutLabel}><span aria-hidden="true">−</span></button>
      <button type="button" onClick={() => changeView(initialAtlasViewport)} aria-label={resetLabel} title={resetLabel}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg></button>
    </div>
    <span className="region-atlas-caption"><span aria-hidden="true" />{label}</span>
  </div>
}
