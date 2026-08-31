import { useEffect, useState } from 'react'
import { fetchPolicyConsentStatus, withdrawAccount, type AuthProfile, type PolicyAgreement } from '../api/auth'

export function AccountDialog({ profile, onClose, onWithdrawn }: { profile: AuthProfile; onClose: () => void; onWithdrawn: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agreements, setAgreements] = useState<PolicyAgreement[]>([])
  useEffect(() => {
    void fetchPolicyConsentStatus()
      .then((status) => setAgreements(status.agreedPolicies))
      .catch(() => setError('약관 동의 내역을 불러오지 못했습니다.'))
  }, [])
  const submit = async () => {
    setIsSubmitting(true); setError(null)
    try { await withdrawAccount(); onWithdrawn() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '회원 탈퇴를 처리하지 못했습니다.'); setIsSubmitting(false) }
  }
  return <div className="account-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title">
      <button type="button" className="login-modal-close" onClick={onClose} aria-label="계정 창 닫기">×</button>
      <p>급똥 계정</p><h1 id="account-title">내 계정</h1>
      <dl><div><dt>이름</dt><dd>{profile.displayName || '이름 없음'}</dd></div><div><dt>이메일</dt><dd>{profile.email || '제공되지 않음'}</dd></div></dl>
      <section className="account-agreements" aria-labelledby="agreement-title"><h2 id="agreement-title">약관 동의 내역</h2>{agreements.length === 0 ? <p>저장된 동의 내역이 없습니다.</p> : <ul>{agreements.map((agreement) => <li key={`${agreement.key}-${agreement.version}`}><a href={agreement.contentPath} target="_blank" rel="noreferrer">{agreement.title}</a><span>v{agreement.version} · {new Date(agreement.agreedAt).toLocaleDateString('ko-KR')}</span></li>)}</ul>}</section>
      {!confirming && <button type="button" className="account-withdraw" onClick={() => setConfirming(true)}>회원 탈퇴</button>}
      {confirming && <div className="account-confirm"><strong>정말 탈퇴할까요?</strong><p>소셜 연결과 로그인 세션이 삭제됩니다. 제보 처리 이력은 개인정보 처리방침에 따라 필요한 기간 동안 비식별 상태로 보관될 수 있습니다.</p><div><button type="button" onClick={() => setConfirming(false)}>취소</button><button type="button" disabled={isSubmitting} onClick={() => void submit()}>{isSubmitting ? '처리 중…' : '탈퇴하기'}</button></div></div>}
      {error && <p className="consent-error" role="alert">{error}</p>}
    </section>
  </div>
}
