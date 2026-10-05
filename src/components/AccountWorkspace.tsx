'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { getCurrentUser, logout, startSocialLogin, type AuthProfile } from '../api/auth'
import { MyReportsPanel } from './MyReportsPanel'
import { NotificationPanel } from './NotificationPanel'
import { AccountDialog } from './AccountDialog'
import { useReviews, REVIEW_UI_ENABLED } from './reviews/useReviews'
import { useLocale, useMessages } from '../i18n/context'
import { localizedPublicPath } from '../i18n/routes'
import { DESKTOP_LAYOUT_QUERY } from '../lib/responsiveLayout'
import { mobileAccountHref } from '../lib/accountNavigation'
import { AccountWorkspaceFrame } from './AccountWorkspaceFrame'
import { LikedToiletsPanel } from './LikedToiletsPanel'
import { AccountHome } from './AccountHome'
const LIKES_ENABLED = process.env.NEXT_PUBLIC_TOILET_ENGAGEMENT_ENABLED === 'true'
const Achievements = dynamic(() => import('./growth/MobileAchievements').then(module => module.MobileAchievements), { loading: AccountPanelLoading })
const ExperienceHistory = dynamic(() => import('./growth/MobileExperienceHistory').then(module => module.MobileExperienceHistory), { loading: AccountPanelLoading })

function AccountPanelLoading() {
  const t = useMessages()
  return <p className="account-workspace-status" role="status">{t('common.loading')}</p>
}

export type AccountView = 'home' | 'likes' | 'achievements' | 'experience' | 'reviews' | 'reports' | 'settings' | 'notifications'

export function AccountWorkspace({ view, reportId = null }: { view: AccountView; reportId?: number | null }) {
  const locale = useLocale(), t = useMessages(), router = useRouter()
  const [profile, setProfile] = useState<AuthProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [withdrawn, setWithdrawn] = useState('')
  const expireSession = useCallback(() => setProfile(null), [])
  const base = localizedPublicPath('/account', locale)!
  const home = localizedPublicPath('/', locale)!
  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_LAYOUT_QUERY)
    const redirectMobile = () => {
      if (desktop.matches) return
      router.replace(mobileAccountHref(home, view, reportId))
    }
    redirectMobile()
    desktop.addEventListener('change', redirectMobile)
    return () => desktop.removeEventListener('change', redirectMobile)
  }, [home, view, reportId, router])
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
  const selectedView = view
  const updateProfile = (next: AuthProfile) => { setProfile(next); window.dispatchEvent(new CustomEvent('geupddong-profile-updated', { detail: next })) }
  return <AccountWorkspaceFrame profile={profile} view={selectedView} onLogout={signOut}>
      {withdrawn && <p role="status">{withdrawn}</p>}
      {selectedView === 'home' && <AccountHome profile={profile} onProfile={updateProfile} onExpired={expireSession} />}
      {selectedView === 'achievements' && <Achievements key={profile.userId} profile={profile} layout="desktop" onBack={goHome} onSessionExpired={expireSession} />}
      {selectedView === 'experience' && <ExperienceHistory key={profile.userId} profile={profile} layout="desktop" onBack={goHome} onSessionExpired={expireSession} />}
      {selectedView === 'reviews' && (reviews.page || <p className="account-workspace-status">{t('common.loading')}</p>)}
      {selectedView === 'likes' && LIKES_ENABLED && <LikedToiletsPanel key={profile.userId} owner={profile.userId} onClose={goHome} onSessionExpired={() => setProfile(null)} />}
      {selectedView === 'reports' && <MyReportsPanel key={reportId} embedded initialExpandedId={reportId} onClose={goHome} onSessionExpired={() => setProfile(null)} />}
      {selectedView === 'notifications' && <NotificationPanel embedded unread={0} onClose={goHome} onSessionExpired={() => setProfile(null)} onCountChange={() => undefined} onOpenReport={reportId => router.push(`${base}?view=reports&report=${reportId}`)} />}
      {selectedView === 'settings' && <AccountDialog embedded profile={profile} onClose={goHome} onWithdrawn={message => { setWithdrawn(message); setProfile(null) }} />}
    {reviews.modal}
  </AccountWorkspaceFrame>
}
