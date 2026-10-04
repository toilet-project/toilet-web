'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useLocale } from '../i18n/context'
import { shareText } from '../i18n/share'
import { buildFacilityShareLink } from '../lib/shareLink'

function ShareIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4M7 10H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-2" /></svg>
}

/** Card controls stay outside cached facility content. The portal avoids clipped mobile cards. */
export function ToiletShareLink({ toiletId }: { toiletId: number }) {
  const locale = useLocale(), text = shareText[locale]
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  const [status, setStatus] = useState(''), [busy, setBusy] = useState(false)
  function close(restoreFocus = false) {
    setPosition(null)
    if (restoreFocus) trigger.current?.focus()
  }
  function open() {
    const rect = trigger.current?.getBoundingClientRect()
    if (!rect) return
    const top = Math.min(rect.bottom + 8, Math.max(8, window.innerHeight - 180))
    setStatus('')
    setPosition({ top, left: Math.max(8, Math.min(rect.right - 208, window.innerWidth - 216)), maxHeight: Math.max(80, window.innerHeight - top - 8) })
  }
  useEffect(() => {
    if (!position) return
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setPosition(null)
    }
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault(); event.stopPropagation(); setPosition(null); trigger.current?.focus()
    }
    function viewport(event: Event) {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return
      setPosition(null)
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape, true)
    window.addEventListener('resize', viewport)
    window.addEventListener('scroll', viewport, true)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape, true)
      window.removeEventListener('resize', viewport)
      window.removeEventListener('scroll', viewport, true)
    }
  }, [position])
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Tab') { close(true); return }
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || [])
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : event.key === 'ArrowDown' ? (current + 1) % items.length
        : event.key === 'ArrowUp' ? (current - 1 + items.length) % items.length : -1
    if (index < 0) return
    event.preventDefault(); items[index]?.focus()
  }
  async function act(method: 'share' | 'copy') {
    if (busy) return
    setBusy(true); setStatus('')
    const native = method === 'share' && typeof navigator.share === 'function'
    try {
      if (native) {
        await navigator.share({ url: buildFacilityShareLink(toiletId, locale, 'share') })
        close(true)
      } else {
        const url = buildFacilityShareLink(toiletId, locale, 'copy')
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(url)
        else {
          const previousFocus = document.activeElement
          const area = document.createElement('textarea')
          area.value = url; area.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
          document.body.append(area); area.select()
          try { if (!document.execCommand('copy')) throw new Error('Copy failed') }
          finally { area.remove(); if (previousFocus instanceof HTMLElement) previousFocus.focus() }
        }
        setStatus(text.copied)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') close(true)
      else setStatus(native ? text.shareFailed : text.copyFailed)
    } finally { setBusy(false) }
  }
  return <>
    <button ref={trigger} id={id} type="button" className="toilet-share-trigger" aria-label={text.share} title={text.share}
      aria-haspopup="menu" aria-expanded={!!position} aria-controls={position ? `${id}-menu` : undefined}
      onClick={() => position ? close() : open()} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); open() } }}><ShareIcon /></button>
    {position && createPortal(<div ref={menu} id={`${id}-menu`} className="toilet-share-menu" role="menu" aria-labelledby={id}
      style={position} onKeyDown={navigate} onClick={event => event.stopPropagation()}>
      <button type="button" role="menuitem" aria-disabled={busy} onClick={() => void act('share')}><ShareIcon /><span>{text.share}</span></button>
      <button type="button" role="menuitem" aria-disabled={busy} onClick={() => void act('copy')}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3" /></svg><span>{text.copy}</span></button>
      <div className="toilet-share-status" role="status" aria-live="polite">{status}</div>
    </div>, document.body)}
  </>
}
