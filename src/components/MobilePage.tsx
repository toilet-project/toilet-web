import { useProfilePhoto } from '../lib/useProfilePhoto'
import { OwnPhoto, PhotoActions, PhotoVisibilityPreference } from './ProfilePhoto'
import { PROFILE_PHOTO_ENABLED } from '../lib/profilePhoto'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AuthExpiredError, startSocialLogin, updateNickname, type AuthProfile } from '../api/auth'
import { MyReportsPanel } from './MyReportsPanel'
import { NotificationPanel } from './NotificationPanel'
import { HistoryScrollTop } from './HistoryScrollTop'
import { AccountDialog } from './AccountDialog'
import { LikedToiletsPanel } from './LikedToiletsPanel'
import type { LikedToilet } from '../lib/toiletEngagement'
import { useMessages, useLocale } from '../i18n/context'
import { accountError } from '../i18n/accountLabels'
import { localizedPublicPath } from '../i18n/routes'
import { BrandWordmark } from './BrandWordmark'
import { GROWTH_ENABLED } from '../lib/growth'
import { growthBadgePath } from '../lib/growthBadgeAssets'
import { useGrowth } from '../lib/useGrowth'
import { MobileGrowthSummary } from './growth/MobileGrowthSummary'
import { MobileAchievements } from './growth/MobileAchievements'
import { MobileExperienceHistory } from './growth/MobileExperienceHistory'
import { achievementText } from '../i18n/achievementText'
import { HeaderIcon } from './HeaderIcon'

import { Icon, type MobileTab, type MobileAccountView } from './MobileNavigation'

const LIKES_ENABLED = process.env.NEXT_PUBLIC_TOILET_ENGAGEMENT_ENABLED === 'true'

function PolicyLinks() {
  const t = useMessages(), locale = useLocale()
  return <nav className="mobile-policy-links" aria-label={t('policy.links')}><a href={localizedPublicPath('/policies/all', locale)!}>{t('policy.terms')}</a><a href="mailto:privacy@geupddong.com">{t('policy.contact')}</a></nav>
}

function LoginLanding({ onLogin }: { onLogin: (provider: 'google' | 'kakao') => void }) {
  const t = useMessages(), locale = useLocale()
  return <div className="mobile-login-landing">
    <span className="brand" aria-label={locale === 'ko' ? '급똥' : 'Geupddong'}><BrandWordmark locale={locale} withSymbol /></span><h1>{t('auth.title')}</h1>
    <p>{t('auth.intro')}</p>
    <button className="social-login google-login" type="button" onClick={() => onLogin('google')}><svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z" /><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.95v2.33A9 9 0 0 0 9 18Z" /><path fill="#FBBC05" d="M3.96 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.95a9 9 0 0 0 0 8.08Z" /><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58A8.62 8.62 0 0 0 9 0 9 9 0 0 0 .95 4.96l3.01 2.33A5.4 5.4 0 0 1 9 3.58Z" /></svg><span>{t('auth.google')}</span></button>
    <button className="social-login kakao-login" type="button" onClick={() => onLogin('kakao')}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3C6.5 3 2 6.5 2 10.8c0 2.8 1.9 5.2 4.8 6.6L6 21l4.2-2.6 1.8.2c5.5 0 10-3.5 10-7.8S17.5 3 12 3Z" /></svg><span>{t('auth.kakao')}</span></button>
    <p className="mobile-signup-note">{t('auth.consentNote')}</p><PolicyLinks />
  </div>
}

function ProfileCard({ profile, onProfile, onSessionExpired, onHistory }: { profile: AuthProfile; onProfile: (profile: AuthProfile) => void; onSessionExpired: () => void; onHistory?: () => void }) {
  const t = useMessages(), locale = useLocale()
  const [editing, setEditing] = useState(false)
  const photo = useProfilePhoto(profile.userId, onSessionExpired, profile.profilePhoto ?? undefined)
  const growthEligible = profile.status === 'ACTIVE' && !profile.consentRequired
  const growth = useGrowth(GROWTH_ENABLED && growthEligible ? profile.userId : null)
  const badges = growthEligible && growth.summary ? growth.summary.badges.flatMap(badge => {
    const src = growthBadgePath(badge, 18)
    return src ? [{ ...badge, src }] : []
  }).slice(0, 3) : []
  const [nickname, setNickname] = useState(profile.displayName || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const active = useRef(false)
  const savePhoto = (next: NonNullable<AuthProfile['profilePhoto']>) => {
    photo.update(next); onProfile({ ...profile, profilePhoto: next })
  }
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => { if (growth.status === 'signedOut') onSessionExpired() }, [growth.status, onSessionExpired])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('')
    try {
      const result = await updateNickname(nickname)
      if (!active.current) return
      onProfile({ ...profile, displayName: result.displayName }); setEditing(false); setMessage(t('account.nicknameSaved'))
    } catch (reason) { if (!active.current) return; if (reason instanceof AuthExpiredError) onSessionExpired(); else setMessage(accountError(reason, locale, 'account.nicknameFailed')) }
    finally { if (active.current) setSaving(false) }
  }
  return <><section className="mobile-profile-card" aria-label={t('account.profile')}>
    <div className="mobile-avatar-wrap"><div className="mobile-avatar"><OwnPhoto state={photo.state} fallback={<span role="img" aria-label={t('account.defaultPhoto')}><Icon name="account" /></span>} /></div>
      {PROFILE_PHOTO_ENABLED && <PhotoActions state={photo.state} loadError={photo.error} onRetry={photo.retry} onSaved={savePhoto} onExpired={onSessionExpired} onOpen={() => { setEditing(false); setMessage('') }} onNotice={setMessage} />}
    </div>
    <div className="mobile-profile-copy"><span>{t('account.profile')}</span><div className="mobile-profile-name-line"><h2>{profile.displayName || t('account.defaultName')}</h2>{badges.length > 0 && <span className="mobile-profile-earned-badges">{badges.map(badge => <img key={`${badge.type}:${badge.code}:${badge.tier}`} src={badge.src} width={18} height={18} alt={badge.name} title={badge.name} />)}</span>}</div><button type="button" className="mobile-profile-settings" onClick={() => { setNickname(profile.displayName || ''); setMessage(''); setEditing(value => !value) }}>{t('account.editProfile')}</button></div>
    {editing && <form className="mobile-profile-form" onSubmit={event => void submit(event)}>
      <label htmlFor="mobile-nickname">{t('account.nickname')}</label><input id="mobile-nickname" value={nickname} onChange={event => setNickname(event.target.value)} minLength={2} maxLength={30} required autoComplete="nickname" />
      <small>{t('account.nicknameHelp')}</small>
      {PROFILE_PHOTO_ENABLED && (photo.error ? <div role="status">{photo.error}<button type="button" onClick={photo.retry}>{t('common.retry')}</button></div> : photo.state ? <PhotoVisibilityPreference state={photo.state} onSaved={savePhoto} onExpired={onSessionExpired} /> : <p role="status">{t('account.photoLoading')}</p>)}
      <div><button type="button" disabled={saving} onClick={() => setEditing(false)}>{t('common.cancel')}</button><button type="submit" disabled={saving || nickname.trim().length < 2}>{saving ? t('common.saving') : t('common.save')}</button></div>
    </form>}
    {message && <p role="status">{message}</p>}
  </section>{growthEligible && <MobileGrowthSummary state={growth} onHistory={GROWTH_ENABLED ? onHistory : undefined} />}</>
}

export function MobilePage({ tab, profile, loading, unread, onProfile, onReports, onAccount, onLogout, onCountChange, onOpenReport, beforeLogin, onSessionExpired, onLikes, onAchievements, onExperience, onOpenLikedToilet, onReviews, accountView = 'home', onBackAccount, reviewPage, focusedReportId, onWithdrawn }: {
  tab: Exclude<MobileTab, 'map'>; profile: AuthProfile | null; loading: boolean; unread: number;
  onProfile: (profile: AuthProfile) => void; onReports: () => void; onAccount: () => void; onLogout: () => void; onCountChange: () => void; onOpenReport: (reportId: number) => void;
  beforeLogin: (tab: MobileTab) => void;
  onSessionExpired: () => void;
  onWithdrawn: (message: string) => void;
  onLikes?: () => void;
  onAchievements?: () => void;
  onExperience?: () => void;
  onOpenLikedToilet: (item: LikedToilet) => void;
  onReviews?: () => void;
  accountView?: MobileAccountView; onBackAccount: () => void; reviewPage?: ReactNode; focusedReportId?: number | null;
}) {
  const t = useMessages(), locale = useLocale()
  const page = useRef<HTMLElement>(null)
  useLayoutEffect(() => { if (page.current) page.current.scrollTop = 0 }, [tab, accountView])
  const historyPage = tab === 'account' && accountView !== 'home'
  return <section ref={page} className={`mobile-page${tab === 'account' ? ' account-controls' : ''}${historyPage ? ' is-history-page' : ''}${tab === 'account' && accountView === 'achievements' ? ' is-achievements-page' : ''}${tab === 'account' && accountView === 'experience' ? ' is-experience-page' : ''}`} aria-label={t(tab === 'account' ? 'nav.account' : 'nav.notifications')}>
    {loading ? <p className="mobile-page-loading" role="status">{t('common.loading')}</p> : !profile ? <LoginLanding onLogin={provider => { beforeLogin(tab); startSocialLogin(provider) }} />
      : tab === 'account' && accountView === 'reports' ? <MyReportsPanel key={`account-reports-${profile.userId}-${focusedReportId ?? 'list'}`} embedded onSessionExpired={onSessionExpired} initialExpandedId={focusedReportId} onClose={onBackAccount} onBack={onBackAccount} />
      : tab === 'account' && accountView === 'likes' && LIKES_ENABLED ? <LikedToiletsPanel key={profile.userId} owner={profile.userId} onClose={onBackAccount} onSessionExpired={onSessionExpired} onOpenToilet={onOpenLikedToilet} />
      : tab === 'account' && accountView === 'achievements' ? <MobileAchievements key={profile.userId} profile={profile} onBack={onBackAccount} onSessionExpired={onSessionExpired} />
      : tab === 'account' && accountView === 'experience' ? <MobileExperienceHistory key={profile.userId} profile={profile} onBack={onBackAccount} onSessionExpired={onSessionExpired} />
      : tab === 'account' && accountView === 'reviews' && onReviews ? reviewPage
      : tab === 'account' && accountView === 'settings' ? <AccountDialog key={profile.userId} embedded profile={profile} onClose={onBackAccount} onWithdrawn={onWithdrawn} />
      : tab === 'account' ? <>
      <header className="mobile-page-heading"><h1>{t('nav.account')}</h1></header>
      <ProfileCard key={profile.userId} profile={profile} onProfile={onProfile} onSessionExpired={onSessionExpired} onHistory={onExperience} />
      <div className="mobile-account-links">{LIKES_ENABLED && onLikes && <button type="button" onClick={onLikes}><Icon name="likes" /><span>{t('nav.myLikes')}</span><span aria-hidden="true">›</span></button>}{GROWTH_ENABLED && profile.status === 'ACTIVE' && !profile.consentRequired && onAchievements && <button type="button" onClick={onAchievements}><Icon name="achievements" /><span>{achievementText(locale).title}</span><span aria-hidden="true">›</span></button>}{onReviews && <button type="button" onClick={onReviews}><HeaderIcon name="reviews" /><span>{t('nav.myReviews')}</span><span aria-hidden="true">›</span></button>}<button type="button" onClick={onReports}><HeaderIcon name="reports" /><span>{t('nav.myReports')}</span><span aria-hidden="true">›</span></button><button type="button" onClick={onAccount}><Icon name="settings" /><span>{t('account.settings')}</span><span aria-hidden="true">›</span></button></div>
      <div className="mobile-account-support"><PolicyLinks /><button type="button" className="mobile-logout" onClick={onLogout}>{t('auth.logout')}</button></div>
    </> : <NotificationPanel key={profile.userId} embedded unread={unread} onSessionExpired={onSessionExpired} onCountChange={onCountChange} onOpenReport={onOpenReport} onClose={() => {}} />}
    {historyPage && !loading && profile && <HistoryScrollTop key={`${accountView}-${profile.userId}`} container={page} />}
  </section>
}
