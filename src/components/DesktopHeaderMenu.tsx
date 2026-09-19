'use client'

import { useLocale, useMessages } from '../i18n/context'
import { localizedPublicPath } from '../i18n/routes'
import { useEffect, useRef, useState } from 'react'

export function DesktopHeaderMenu({ authenticated, onReports, onAccount, onLogout, onReviews, compact = false }: {
  authenticated: boolean; onReports: () => void; onAccount: () => void; onLogout: () => void; onReviews?: () => void; compact?: boolean
}) {
  const t = useMessages(), locale = useLocale()
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
    <button ref={trigger} type="button" className="header-menu-trigger" aria-label={t('menu.all')} aria-expanded={open} aria-controls="desktop-header-menu"
      onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) } }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
    </button>
    {open && <nav id="desktop-header-menu" ref={panel} className="header-menu-panel" aria-label={t('menu.all')}>
      {!compact && <>{onReviews && <button type="button" onClick={() => action(onReviews)}>{t('nav.myReviews')}</button>}<button type="button" onClick={() => action(onReports)}>{t('nav.myReports')}</button>
      {authenticated && <button type="button" onClick={() => action(onAccount)}>{t('auth.account')}</button>}
      <div className="header-menu-divider" /></>}
      <a href={localizedPublicPath(compact ? '/policies/all' : '/policies/terms', locale)!}>{t('menu.terms')}</a>
      {!compact && <><a href={localizedPublicPath('/policies/privacy', locale)!}>{t('menu.privacy')}</a>
      <a href={localizedPublicPath('/policies/location', locale)!}>{t('menu.location')}</a></>}
      <a href="mailto:privacy@geupddong.com">{t('menu.contact')}</a>
      {authenticated && !compact && <><div className="header-menu-divider" /><button type="button" onClick={() => action(onLogout)}>{t('menu.logout')}</button></>}
    </nav>}
  </div>
}
