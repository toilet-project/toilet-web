'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, logout, startSocialLogin, type AuthProfile } from '../api/auth'
import { MyReportsPanel } from './MyReportsPanel'
import { NotificationPanel } from './NotificationPanel'
import { AccountDialog } from './AccountDialog'
import { useReviews, REVIEW_UI_ENABLED } from './reviews/useReviews'
import { useLocale, useMessages } from '../i18n/context'
import { localizedPublicPath } from '../i18n/routes'
import { DESKTOP_LAYOUT_QUERY } from '../lib/responsiveLayout'
import { AccountWorkspaceFrame } from './AccountWorkspaceFrame'

export type AccountView = 'home' | 'reviews' | 'reports' | 'settings' | 'notifications'

export function AccountWorkspace({ view, reportId = null }: { view: AccountView; reportId?: number | null }) {
  const locale = useLocale(), t = useMessages(), router = useRouter()
  const [profile, setProfile] = useState<AuthProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [withdrawn, setWithdrawn] = useState('')
  const base = localizedPublicPath('/account', locale)!
  const home = localizedPublicPath('/', locale)!
  useEffect(() => {
    if (window.matchMedia(DESKTOP_LAYOUT_QUERY).matches) return
    router.replace(`${home}?tab=${view === 'notifications' ? 'notifications' : 'account'}${view !== 'home' && view !== 'notifications' ? `&view=${view}` : ''}`)
  }, [home, view, router])
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
  const selectedView = view === 'home' ? 'settings' : view
  return <AccountWorkspaceFrame profile={profile} view={selectedView} onLogout={signOut}>
      {withdrawn && <p role="status">{withdrawn}</p>}
      {selectedView === 'reviews' && (reviews.page || <p className="account-workspace-status">{t('common.loading')}</p>)}
      {selectedView === 'reports' && <MyReportsPanel key={reportId} embedded initialExpandedId={reportId} onClose={goHome} onSessionExpired={() => setProfile(null)} />}
      {selectedView === 'notifications' && <NotificationPanel embedded unread={0} onClose={goHome} onSessionExpired={() => setProfile(null)} onCountChange={() => undefined} onOpenReport={reportId => router.push(`${base}?view=reports&report=${reportId}`)} />}
      {selectedView === 'settings' && <AccountDialog embedded profile={profile} onClose={goHome} onWithdrawn={message => { setWithdrawn(message); setProfile(null) }} />}
    {reviews.modal}
  </AccountWorkspaceFrame>
}

export function accountView(value?: string): AccountView {
  return value === 'reviews' || value === 'reports' || value === 'settings' || value === 'notifications' ? value : 'home'
}
