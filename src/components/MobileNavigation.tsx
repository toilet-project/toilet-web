import { useState } from 'react'
import { AuthExpiredError, startSocialLogin, updateNickname, type AuthProfile } from '../api/auth'
import { MyReportsPanel } from './MyReportsPanel'

export type MobileTab = 'map' | 'notifications' | 'account'
type IconName = MobileTab | 'community' | 'settings'

function Icon({ name }: { name: IconName }) {
  const paths = {
    map: <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z" /><path d="M9 3v16M15 5v16" /></>,
    community: <><path d="M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z" /><path d="M8 10h8M8 14h5" /></>,
    notifications: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6" /></>,
    account: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    settings: <><path d="m9 3-1 3-3 1 1 4-2 2 2 4 3-1 3 3 3-3 3 1 2-4-2-2 1-4-3-1-1-3Z" /><circle cx="12" cy="11" r="3" /></>,
  }
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function MobileNavigation({ tab, onChange, unread }: { tab: MobileTab; onChange: (tab: MobileTab) => void; unread: number }) {
  return <nav className="mobile-navigation" aria-label="하단 내비게이션">
    <button type="button" aria-current={tab === 'map' ? 'page' : undefined} onClick={() => onChange('map')}><Icon name="map" /><span>지도</span></button>
    <button type="button" disabled aria-label="커뮤니티 · coming soon"><Icon name="community" /><span>커뮤니티</span><small>coming soon</small></button>
    <button type="button" aria-current={tab === 'notifications' ? 'page' : undefined} onClick={() => onChange('notifications')}><Icon name="notifications" /><span>알림</span>{unread > 0 && <b aria-label={`읽지 않은 알림 ${unread}개`}>{unread > 99 ? '99+' : unread}</b>}</button>
    <button type="button" aria-current={tab === 'account' ? 'page' : undefined} onClick={() => onChange('account')}><Icon name="account" /><span>내 페이지</span></button>
  </nav>
}

function PolicyLinks() {
  return <nav className="mobile-policy-links" aria-label="서비스 안내"><a href="/policies/all">이용약관</a><a href="mailto:privacy@geupddong.com">문의</a></nav>
}

function LoginLanding({ tab, onLogin }: { tab: MobileTab; onLogin: (provider: 'google' | 'kakao') => void }) {
  return <div className="mobile-login-landing">
    <span className="brand">급똥</span><h1>{tab === 'notifications' ? '로그인하고 알림을 확인하세요' : '로그인 / 회원가입'}</h1>
    <p>카카오·구글 계정으로 간편하게 시작하세요.</p>
    <button className="social-login kakao-login" type="button" onClick={() => onLogin('kakao')}>Kakao로 계속하기</button>
    <button className="social-login google-login" type="button" onClick={() => onLogin('google')}>Google로 계속하기</button>
    <p className="mobile-signup-note">처음 가입할 때 소셜 인증 후 필수 약관 동의가 이어집니다.</p><PolicyLinks />
  </div>
}

function ProfileCard({ profile, onProfile, onSessionExpired }: { profile: AuthProfile; onProfile: (profile: AuthProfile) => void; onSessionExpired: () => void }) {
  const [editing, setEditing] = useState(false)
  const [nickname, setNickname] = useState(profile.displayName || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('')
    try {
      const result = await updateNickname(nickname)
      onProfile({ ...profile, displayName: result.displayName }); setEditing(false); setMessage('닉네임을 변경했어요.')
    } catch (reason) { if (reason instanceof AuthExpiredError) onSessionExpired(); else setMessage(reason instanceof Error ? reason.message : '닉네임을 저장하지 못했어요.') }
    finally { setSaving(false) }
  }
  return <section className="mobile-profile-card" aria-label="내 프로필">
    <div className="mobile-avatar-wrap"><div className="mobile-avatar" role="img" aria-label="기본 프로필 이미지"><Icon name="account" /></div>
      <button type="button" className="mobile-profile-edit" aria-label="프로필 수정" onClick={() => { setNickname(profile.displayName || ''); setMessage(''); setEditing(value => !value) }}><Icon name="settings" /></button>
    </div>
    <h2>{profile.displayName || '급똥 사용자'}</h2><p>오늘도 가볍게, 급똥과 함께</p>
    {editing && <form className="mobile-profile-form" onSubmit={event => void submit(event)}>
      <p>프로필 이미지 수정은 구현 예정이에요.</p>
      <label htmlFor="mobile-nickname">닉네임</label><input id="mobile-nickname" value={nickname} onChange={event => setNickname(event.target.value)} minLength={2} maxLength={30} required autoComplete="nickname" />
      <small>2~30자 · 다른 사용자와 같은 닉네임도 사용할 수 있어요.</small>
      <div><button type="button" disabled={saving} onClick={() => setEditing(false)}>취소</button><button type="submit" disabled={saving || nickname.trim().length < 2}>{saving ? '저장 중…' : '저장하기'}</button></div>
    </form>}
    {message && <p role="status">{message}</p>}
  </section>
}

export function MobilePage({ tab, profile, loading, unread, onProfile, onReports, onAccount, onLogout, onNotifications, beforeLogin, onSessionExpired }: {
  tab: Exclude<MobileTab, 'map'>; profile: AuthProfile | null; loading: boolean; unread: number;
  onProfile: (profile: AuthProfile) => void; onReports: () => void; onAccount: () => void; onLogout: () => void; onNotifications: () => void;
  beforeLogin: (tab: MobileTab) => void;
  onSessionExpired: () => void;
}) {
  return <section className="mobile-page" aria-label={tab === 'account' ? '내 페이지' : '알림 페이지'}>
    {loading ? <p className="mobile-page-loading" role="status">불러오는 중…</p> : !profile ? <LoginLanding tab={tab} onLogin={provider => { beforeLogin(tab); startSocialLogin(provider) }} /> : tab === 'account' ? <>
      <header className="mobile-page-heading"><h1>내 페이지</h1></header>
      <ProfileCard key={profile.userId} profile={profile} onProfile={onProfile} onSessionExpired={onSessionExpired} />
      <div className="mobile-account-links"><button type="button" onClick={onReports}>내 제보 <span aria-hidden="true">›</span></button><button type="button" onClick={onAccount}>계정 관리 · 동의 내역 <span aria-hidden="true">›</span></button></div>
      <PolicyLinks /><button type="button" className="mobile-logout" onClick={onLogout}>로그아웃</button>
    </> : <>
      <header className="mobile-page-heading"><h1>알림</h1><button type="button" onClick={onNotifications}>받은 알림{unread > 0 ? ` (${unread})` : ''}</button></header>
      <label className="mobile-notification-category">알림 항목<select aria-label="알림 항목" value="my-reports" onChange={() => {}}><option value="my-reports">내 제보</option></select></label>
      <MyReportsPanel embedded onClose={() => {}} />
    </>}
  </section>
}
