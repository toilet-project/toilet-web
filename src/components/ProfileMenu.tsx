'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { AuthProfile } from '../api/auth'
import { OwnPhoto } from './ProfilePhoto'
import { useLocale, useMessages } from '../i18n/context'
import { localizedPublicPath } from '../i18n/routes'

export function ProfileMenu({ profile, onLogout }: { profile: AuthProfile; onLogout: () => void }) {
  const t = useMessages(), locale = useLocale()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const account = (view?: string) => `${localizedPublicPath('/account', locale)!}${view ? `?view=${view}` : ''}`
  return <div className="profile-menu" ref={root}>
    <button type="button" className="profile-menu-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span className="profile-menu-avatar"><OwnPhoto state={profile.profilePhoto ?? null} fallback={<span aria-hidden="true">{(profile.displayName || profile.email || 'G').slice(0, 1).toUpperCase()}</span>} /></span>
      <span className="profile-menu-name">{profile.displayName || t('account.defaultName')}</span>
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m5 7 5 5 5-5" /></svg>
    </button>
    {open && <div className="profile-menu-panel" role="menu">
      <Link role="menuitem" href={account('reviews')} onClick={() => setOpen(false)}>{t('nav.myReviews')}</Link>
      <Link role="menuitem" href={account('reports')} onClick={() => setOpen(false)}>{t('nav.myReports')}</Link>
      <Link role="menuitem" href={account('settings')} onClick={() => setOpen(false)}>{t('auth.account')}</Link>
      <div className="profile-menu-rule" />
      <button type="button" role="menuitem" onClick={() => { setOpen(false); onLogout() }}>{t('menu.logout')}</button>
    </div>}
  </div>
}
