import { useEffect, useRef, useState } from 'react'
import { AuthExpiredError, startSocialLogin, updateNickname, type AuthProfile } from '../api/auth'
import { MyReportsPanel } from './MyReportsPanel'

export type MobileTab = 'map' | 'notifications' | 'account'
type IconName = MobileTab | 'community' | 'settings'

function Icon({ name }: { name: IconName }) {
  const paths = {
    map: <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z" /><path d="M9 3v16M15 5v16" /></>,
    community: <><path d="M20 11a8 8 0 0 1-8 8H7l-4 2 1-5a8 8 0 1 1 16-5Z" /><path d="M8 9h8M8 13h5" /></>,
    notifications: <><path d="M18 9a6 6 0 0 0-12 0c0 6-2 6-2 8h16c0-2-2-2-2-8M10 21h4" /></>,
    account: <><circle cx="12" cy="7.5" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    settings: <><path d="m10 3-.6 2.2-2 .9-2-.7-2 3.4 1.6 1.5v2.4l-1.6 1.5 2 3.4 2-.7 2 .9L10 20h4l.6-2.2 2-.9 2 .7 2-3.4-1.6-1.5v-2.4l1.6-1.5-2-3.4-2 .7-2-.9L14 3Z" /><circle cx="12" cy="11.5" r="3" /></>,
  }
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function MobileNavigation({ tab, onChange, unread }: { tab: MobileTab; onChange: (tab: MobileTab) => void; unread: number }) {
  const [communityNotice, setCommunityNotice] = useState(false)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current) }, [])
  const showCommunityNotice = () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setCommunityNotice(true)
    noticeTimer.current = setTimeout(() => { setCommunityNotice(false); noticeTimer.current = null }, 1000)
  }
  return <nav className="mobile-navigation" aria-label="하단 내비게이션">
    <button type="button" aria-current={tab === 'map' ? 'page' : undefined} onClick={() => onChange('map')}><span className="mobile-nav-icon"><Icon name="map" /></span><span>지도</span></button>
    <button type="button" onClick={showCommunityNotice}><span className="mobile-nav-icon"><Icon name="community" /></span><span>커뮤니티</span></button>
    <button type="button" aria-current={tab === 'notifications' ? 'page' : undefined} onClick={() => onChange('notifications')}><span className="mobile-nav-icon"><Icon name="notifications" /></span><span>알림</span>{unread > 0 && <b aria-label={`읽지 않은 알림 ${unread}개`}>{unread > 99 ? '99+' : unread}</b>}</button>
    <button type="button" aria-current={tab === 'account' ? 'page' : undefined} onClick={() => onChange('account')}><span className="mobile-nav-icon"><Icon name="account" /></span><span>내 페이지</span></button>
    <div className="mobile-community-notice" role="status" aria-live="polite" aria-atomic="true">{communityNotice ? '준비 중이에요' : ''}</div>
  </nav>
}

function PolicyLinks() {
  return <nav className="mobile-policy-links" aria-label="서비스 안내"><a href="/policies/all">이용약관</a><a href="mailto:privacy@geupddong.com">문의</a></nav>
}

function LoginLanding({ tab, onLogin }: { tab: MobileTab; onLogin: (provider: 'google' | 'kakao') => void }) {
  return <div className="mobile-login-landing">
    <span className="brand">급똥</span><h1>{tab === 'notifications' ? '로그인하고 알림을 확인하세요' : '로그인 · 간편가입'}</h1>
    <p>카카오·구글 계정으로 간편하게 시작하세요.</p>
    <button className="social-login kakao-login" type="button" onClick={() => onLogin('kakao')}><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3C6.5 3 2 6.5 2 10.8c0 2.8 1.9 5.2 4.8 6.6L6 21l4.2-2.6 1.8.2c5.5 0 10-3.5 10-7.8S17.5 3 12 3Z" /></svg><span>Kakao로 계속하기</span></button>
    <button className="social-login google-login" type="button" onClick={() => onLogin('google')}><svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z" /><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.95v2.33A9 9 0 0 0 9 18Z" /><path fill="#FBBC05" d="M3.96 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.95a9 9 0 0 0 0 8.08Z" /><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58A8.62 8.62 0 0 0 9 0 9 9 0 0 0 .95 4.96l3.01 2.33A5.4 5.4 0 0 1 9 3.58Z" /></svg><span>Google로 계속하기</span></button>
    <p className="mobile-signup-note">처음 가입할 때 소셜 인증 후 필수 약관 동의가 이어집니다.</p><PolicyLinks />
  </div>
}

function ProfileCard({ profile, onProfile, onSessionExpired }: { profile: AuthProfile; onProfile: (profile: AuthProfile) => void; onSessionExpired: () => void }) {
  const [editing, setEditing] = useState(false)
  const [nickname, setNickname] = useState(profile.displayName || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const active = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('')
    try {
      const result = await updateNickname(nickname)
      if (!active.current) return
      onProfile({ ...profile, displayName: result.displayName }); setEditing(false); setMessage('닉네임을 변경했어요.')
    } catch (reason) { if (!active.current) return; if (reason instanceof AuthExpiredError) onSessionExpired(); else setMessage(reason instanceof Error ? reason.message : '닉네임을 저장하지 못했어요.') }
    finally { if (active.current) setSaving(false) }
  }
  return <section className="mobile-profile-card" aria-label="내 프로필">
    <div className="mobile-avatar-wrap"><div className="mobile-avatar" role="img" aria-label="기본 프로필 이미지"><Icon name="account" /></div>
      <button type="button" className="mobile-profile-edit" aria-label="프로필 수정" onClick={() => { setNickname(profile.displayName || ''); setMessage(''); setEditing(value => !value) }}><Icon name="settings" /></button>
    </div>
    <div className="mobile-profile-copy"><span>내 프로필</span><h2>{profile.displayName || '급똥 사용자'}</h2></div>
    {editing && <form className="mobile-profile-form" onSubmit={event => void submit(event)}>
      <p>프로필 이미지 수정은 구현 예정이에요.</p>
      <label htmlFor="mobile-nickname">닉네임</label><input id="mobile-nickname" value={nickname} onChange={event => setNickname(event.target.value)} minLength={2} maxLength={30} required autoComplete="nickname" />
      <small>2~30자 · 다른 사용자와 같은 닉네임도 사용할 수 있어요.</small>
      <div><button type="button" disabled={saving} onClick={() => setEditing(false)}>취소</button><button type="submit" disabled={saving || nickname.trim().length < 2}>{saving ? '저장 중…' : '저장하기'}</button></div>
    </form>}
    {message && <p role="status">{message}</p>}
  </section>
}

export function MobilePage({ tab, profile, loading, unread, onProfile, onReports, onAccount, onLogout, onNotifications, beforeLogin, onSessionExpired, onReviews }: {
  tab: Exclude<MobileTab, 'map'>; profile: AuthProfile | null; loading: boolean; unread: number;
  onProfile: (profile: AuthProfile) => void; onReports: () => void; onAccount: () => void; onLogout: () => void; onNotifications: () => void;
  beforeLogin: (tab: MobileTab) => void;
  onSessionExpired: () => void;
  onReviews?: () => void;
}) {
  return <section className="mobile-page" aria-label={tab === 'account' ? '내 페이지' : '알림 페이지'}>
    {loading ? <p className="mobile-page-loading" role="status">불러오는 중…</p> : !profile ? <LoginLanding tab={tab} onLogin={provider => { beforeLogin(tab); startSocialLogin(provider) }} /> : tab === 'account' ? <>
      <header className="mobile-page-heading"><h1>내 페이지</h1></header>
      <ProfileCard key={profile.userId} profile={profile} onProfile={onProfile} onSessionExpired={onSessionExpired} />
      <div className="mobile-account-links">{onReviews && <button type="button" onClick={onReviews}><Icon name="community" /><span>내 리뷰</span><span aria-hidden="true">›</span></button>}<button type="button" onClick={onReports}><Icon name="community" /><span>내 제보</span><span aria-hidden="true">›</span></button><button type="button" onClick={onAccount}><Icon name="settings" /><span>계정 관리 · 동의 내역</span><span aria-hidden="true">›</span></button></div>
      <div className="mobile-account-support"><PolicyLinks /><button type="button" className="mobile-logout" onClick={onLogout}>로그아웃</button></div>
    </> : <>
      <header className="mobile-page-heading"><h1>알림</h1><label className="mobile-notification-category"><span className="sr-only">알림 항목</span><select aria-label="알림 항목" value="my-reports" onChange={() => {}}><option value="my-reports">내 제보</option></select></label></header>
      <button type="button" className="mobile-inbox-link" onClick={onNotifications}><Icon name="notifications" /><span>받은 알림</span>{unread > 0 && <b>{unread}</b>}<span aria-hidden="true">›</span></button>
      <MyReportsPanel key={profile.userId} embedded onSessionExpired={onSessionExpired} onClose={() => {}} />
    </>}
  </section>
}
