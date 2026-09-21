'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getCurrentUser, logout, startSocialLogin, type AuthProfile } from '../api/auth'
import { MyReportsPanel } from './MyReportsPanel'
import { NotificationPanel } from './NotificationPanel'
import { AccountDialog } from './AccountDialog'
import { OwnPhoto } from './ProfilePhoto'
import { useReviews, REVIEW_UI_ENABLED } from './reviews/useReviews'
import { useLocale, useMessages } from '../i18n/context'
import { localizedPublicPath } from '../i18n/routes'

export type AccountView = 'home' | 'reviews' | 'reports' | 'settings' | 'notifications'

export function AccountWorkspace({ view }: { view: AccountView }) {
  const locale = useLocale(), t = useMessages(), router = useRouter()
  const [profile, setProfile] = useState<AuthProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [withdrawn, setWithdrawn] = useState('')
  const base = localizedPublicPath('/account', locale)!
  const home = localizedPublicPath('/', locale)!
  useEffect(() => { let active = true; void getCurrentUser().then(value => { if (active) setProfile(value) }).catch(() => undefined).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [])
  const reviews = useReviews(profile?.status === 'ACTIVE' && !profile.consentRequired ? profile.userId : null, {
    requireLogin: () => router.push(base),
    verifySession: async isCurrent => {
      const current = await getCurrentUser()
      if (!isCurrent() || !current || current.userId !== profile?.userId) return false
      setProfile(current)
      return current.status === 'ACTIVE' && !current.consentRequired
    },
  }, { embedded: true, contextKey: `account:${view}`, onOpen: () => undefined, onClose: () => router.push(base) })
  useEffect(() => { if (view === 'reviews' && profile && REVIEW_UI_ENABLED) void reviews.openMine() }, [view, profile?.userId]) // eslint-disable-line react-hooks/exhaustive-deps
  const goHome = () => router.push(base)
  const signOut = () => { void logout().then(() => { setProfile(null); router.push(home) }) }
  if (loading) return <div className="account-workspace-status" role="status">{t('common.loading')}</div>
  if (!profile) return <div className="account-login"><h1>{t('auth.title')}</h1><p>{t('auth.intro')}</p><button type="button" onClick={() => startSocialLogin('google')}>{t('auth.google')}</button><button type="button" onClick={() => startSocialLogin('kakao')}>{t('auth.kakao')}</button></div>
  return <div className="account-workspace">
    <nav className="account-workspace-rail" aria-label={t('nav.account')}>
      <div className="account-workspace-profile"><span className="account-workspace-avatar"><OwnPhoto state={profile.profilePhoto ?? null} fallback={<span>{(profile.displayName || 'G')[0]}</span>} /></span><strong>{profile.displayName || t('account.defaultName')}</strong><small>{profile.email}</small></div>
      <Link href={base} aria-current={view === 'home' ? 'page' : undefined}>{t('nav.account')}</Link>
      {REVIEW_UI_ENABLED && <Link href={`${base}?view=reviews`} aria-current={view === 'reviews' ? 'page' : undefined}>{t('nav.myReviews')}</Link>}
      <Link href={`${base}?view=reports`} aria-current={view === 'reports' ? 'page' : undefined}>{t('nav.myReports')}</Link>
      <Link href={`${base}?view=notifications`} aria-current={view === 'notifications' ? 'page' : undefined}>{t('nav.notifications')}</Link>
      <Link href={`${base}?view=settings`} aria-current={view === 'settings' ? 'page' : undefined}>{t('auth.account')}</Link>
      <button type="button" onClick={signOut}>{t('menu.logout')}</button>
    </nav>
    <section className="account-workspace-content" aria-label={t('nav.account')}>
      {withdrawn && <p role="status">{withdrawn}</p>}
      {view === 'home' && <><div className="account-workspace-hero"><span>MY PAGE</span><h1>{t('nav.account')}</h1><p>{profile.displayName || t('account.defaultName')}</p></div><div className="account-workspace-cards">{([
        ['reviews', t('nav.myReviews')], ['reports', t('nav.myReports')], ['settings', t('auth.account')],
      ] as const).filter(([item]) => item !== 'reviews' || REVIEW_UI_ENABLED).map(([item, label]) => <Link key={item} href={`${base}?view=${item}`}><strong>{label}</strong><span>↗</span></Link>)}</div></>}
      {view === 'reviews' && (reviews.page || <p className="account-workspace-status">{t('common.loading')}</p>)}
      {view === 'reports' && <MyReportsPanel embedded onClose={goHome} onBack={goHome} onSessionExpired={() => setProfile(null)} />}
      {view === 'notifications' && <NotificationPanel embedded unread={0} onClose={goHome} onSessionExpired={() => setProfile(null)} onCountChange={() => undefined} onOpenReport={() => router.push(`${base}?view=reports`)} />}
      {view === 'settings' && <AccountDialog embedded profile={profile} onClose={goHome} onWithdrawn={message => { setWithdrawn(message); setProfile(null) }} />}
    </section>
  </div>
}

export function accountView(value?: string): AccountView {
  return value === 'reviews' || value === 'reports' || value === 'settings' || value === 'notifications' ? value : 'home'
}
