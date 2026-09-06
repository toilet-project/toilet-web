'use client'

import { useEffect, useRef, useState } from 'react'

export function DesktopHeaderMenu({ authenticated, onReports, onAccount, onLogout, compact = false }: {
  authenticated: boolean; onReports: () => void; onAccount: () => void; onLogout: () => void; compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!open) return
    panel.current?.querySelector<HTMLElement>('button, a')?.focus()
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const action = (callback: () => void) => { setOpen(false); callback() }
  return <div className="desktop-header-menu" ref={root} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false)
  }}>
    <button ref={trigger} type="button" className="header-menu-trigger" aria-label="전체 메뉴" aria-expanded={open} aria-controls="desktop-header-menu"
      onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) } }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
    </button>
    {open && <nav id="desktop-header-menu" ref={panel} className="header-menu-panel" aria-label="전체 메뉴">
      {!compact && <><button type="button" onClick={() => action(onReports)}>내 제보</button>
      {authenticated && <button type="button" onClick={() => action(onAccount)}>내 계정</button>}
      <div className="header-menu-divider" /></>}
      <a href={compact ? '/policies/all' : '/policies/terms'}>이용약관</a>
      {!compact && <><a href="/policies/privacy">개인정보 처리방침</a>
      <a href="/policies/location">위치정보 안내</a></>}
      <a href="mailto:privacy@geupddong.com">문의</a>
      {authenticated && !compact && <><div className="header-menu-divider" /><button type="button" onClick={() => action(onLogout)}>로그아웃</button></>}
    </nav>}
  </div>
}
