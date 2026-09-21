'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import type { AuthProfile } from '../api/auth'
import { useLocale, useMessages } from '../i18n/context'
import { localizedPublicPath } from '../i18n/routes'
import { OwnPhoto } from './ProfilePhoto'
import { HeaderIcon } from './HeaderIcon'
import { REVIEW_UI_ENABLED } from './reviews/useReviews'

export function AccountWorkspaceFrame({ profile, view, onLogout, children }: { profile: AuthProfile; view: string; onLogout: () => void; children: ReactNode }) {
  const locale = useLocale(), t = useMessages()
  const base = localizedPublicPath('/account', locale)!
  return <div className="account-workspace">
    <nav className="account-workspace-rail" aria-label={t('nav.account')}>
      <div className="account-workspace-profile"><span className="account-workspace-avatar"><OwnPhoto state={profile.profilePhoto ?? null} fallback={<span>{(profile.displayName || 'G')[0]}</span>} /></span><strong>{profile.displayName || t('account.defaultName')}</strong><small>{profile.email}</small></div>
      {REVIEW_UI_ENABLED && <Link href={`${base}?view=reviews`} aria-current={view === 'reviews' ? 'page' : undefined}><HeaderIcon name="reviews" /><span>{t('nav.myReviews')}</span></Link>}
      <Link href={`${base}?view=reports`} aria-current={view === 'reports' ? 'page' : undefined}><HeaderIcon name="reports" /><span>{t('nav.myReports')}</span></Link>
      <Link href={`${base}?view=settings`} aria-current={view === 'settings' ? 'page' : undefined}><HeaderIcon name="account" /><span>{t('auth.account')}</span></Link>
      <button type="button" onClick={onLogout}><HeaderIcon name="logout" /><span>{t('menu.logout')}</span></button>
    </nav>
    <section className="account-workspace-content" aria-label={t('nav.account')}>{children}</section>
  </div>
}
