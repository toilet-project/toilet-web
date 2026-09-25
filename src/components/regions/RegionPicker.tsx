'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'

export function RegionPicker({ areas, title, label, countLabel, closeLabel }: {
  areas: { code: string; name: string; count: string; href: string; outlineHref?: string }[]
  title: string; label: string; countLabel: string; closeLabel: string
}) {
  const router = useRouter()
  const picker = useRef<HTMLDetailsElement>(null), id = useId()
  const prefetched = useRef(new Set<string>())
  const preloadedOutlines = useRef(new Map<string, HTMLImageElement>())
  const [open, setOpen] = useState(false)
  function prefetch(area: (typeof areas)[number]) {
    if (prefetched.current.has(area.href)) return
    prefetched.current.add(area.href)
    if (area.outlineHref && !preloadedOutlines.current.has(area.outlineHref)) {
      const image = new Image()
      preloadedOutlines.current.set(area.outlineHref, image)
      image.src = area.outlineHref
    }
    router.prefetch(area.href)
  }
  function close(restoreFocus = true) {
    if (picker.current) picker.current.open = false
    if (restoreFocus) picker.current?.querySelector('summary')?.focus()
  }
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !picker.current?.contains(event.target) && picker.current) picker.current.open = false
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  return <details ref={picker} className="region-atlas-picker" onToggle={event => setOpen(event.currentTarget.open)}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close() } }}
    onBlur={event => {
      // Touch may blur the summary before delivering a link click.
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close(false)
    }}>
    <summary aria-controls={id} aria-expanded={open}>{title}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></summary>
    <section id={id} className="region-atlas-picker-panel" aria-label={title}>
      <div className="region-atlas-picker-heading"><strong>{label}</strong><button type="button" onClick={() => close()} aria-label={closeLabel}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>
      <div className="region-atlas-picker-list">{areas.map(area => <Link key={area.code} href={area.href} prefetch={false}
        onPointerEnter={() => prefetch(area)} onFocus={() => prefetch(area)} onPointerDown={() => prefetch(area)} onNavigate={() => close(false)}>
        <strong>{area.name}</strong><span aria-label={`${area.count} ${countLabel}`}>{area.count}</span>
      </Link>)}</div>
    </section>
  </details>
}
