'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import type { AuthProfile } from '../api/auth'
import { useLocale, useMessages } from '../i18n/context'
import { localizedPublicPath } from '../i18n/routes'
import { OwnPhoto } from './ProfilePhoto'
import { HeaderIcon } from './HeaderIcon'
import { REVIEW_UI_ENABLED } from './reviews/useReviews'
import { growthText } from '../i18n/growthText'
import { achievementText } from '../i18n/achievementText'
import { GROWTH_ENABLED } from '../lib/growth'
const LIKES_ENABLED = process.env.NEXT_PUBLIC_TOILET_ENGAGEMENT_ENABLED === 'true'

export function AccountWorkspaceFrame({ profile, view, onLogout, children }: { profile: AuthProfile; view: string; onLogout: () => void; children: ReactNode }) {
  const locale = useLocale(), t = useMessages()
  const growth = growthText(locale)
  const growthAvailable = GROWTH_ENABLED && profile.status === 'ACTIVE' && !profile.consentRequired
  const content = useRef<HTMLElement>(null)
  useEffect(() => { content.current?.scrollTo({ top: 0 }) }, [view])
  const base = localizedPublicPath('/account', locale)!
  return <div className={`account-workspace${view !== 'notifications' ? ' account-controls' : ''}`}>
    <nav className="account-workspace-rail" aria-label={t('nav.account')}>
      <div className="account-workspace-profile"><span className="account-workspace-avatar"><OwnPhoto state={profile.profilePhoto ?? null} fallback={<span>{(profile.displayName || 'G')[0]}</span>} /></span><strong>{profile.displayName || t('account.defaultName')}</strong></div>
      <Link href={base} aria-current={view === 'home' ? 'page' : undefined}><HeaderIcon name="account" /><span>{growth.home}</span></Link>
      {LIKES_ENABLED && <Link href={`${base}?view=likes`} aria-current={view === 'likes' ? 'page' : undefined}><HeaderIcon name="likes" /><span>{t('nav.myLikes')}</span></Link>}
      {growthAvailable && <Link href={`${base}?view=achievements`} aria-current={view === 'achievements' ? 'page' : undefined}><HeaderIcon name="achievements" /><span>{achievementText(locale).title}</span></Link>}
      {REVIEW_UI_ENABLED && <Link href={`${base}?view=reviews`} aria-current={view === 'reviews' ? 'page' : undefined}><HeaderIcon name="reviews" /><span>{t('nav.myReviews')}</span></Link>}
      <Link href={`${base}?view=reports`} aria-current={view === 'reports' ? 'page' : undefined}><HeaderIcon name="reports" /><span>{t('nav.myReports')}</span></Link>
      <Link href={`${base}?view=settings`} aria-current={view === 'settings' ? 'page' : undefined}><HeaderIcon name="account" /><span>{t('auth.account')}</span></Link>
      <button type="button" onClick={onLogout}><HeaderIcon name="logout" /><span>{t('menu.logout')}</span></button>
    </nav>
    <section ref={content} className="account-workspace-content" aria-label={t('nav.account')}>{children}</section>
  </div>
}
