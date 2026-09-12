import { useEffect, useRef, useState } from 'react'
import { fetchPolicyConsentStatus, fetchWithdrawalOptions, withdrawAccount, type AuthProfile, type PolicyAgreement, type WithdrawalOptions } from '../api/auth'
import { AccountErasureNotice } from './AccountErasureNotice'
import { HistoryHeading } from './HistoryControls'
import { PolicyDisclosure } from './PolicyDisclosure'

export function AccountDialog({ profile, onClose, onWithdrawn, embedded = false }: { profile: AuthProfile; onClose: () => void; onWithdrawn: (message: string) => void; embedded?: boolean }) {
  const [confirming, setConfirming] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agreements, setAgreements] = useState<PolicyAgreement[]>([])
  const [agreementsLoading, setAgreementsLoading] = useState(true)
  const [retainForRecovery, setRetainForRecovery] = useState(false)
  const [options, setOptions] = useState<WithdrawalOptions | null>(null)
  const optionsRequest = useRef(0)
  const openWithdrawal = async () => {
    const request = ++optionsRequest.current
    setConfirming(true); setRetainForRecovery(false); setError(null); setOptions(null)
    try { const value = await fetchWithdrawalOptions(); if (request === optionsRequest.current) setOptions(value) }
    catch (reason) { if (request === optionsRequest.current) setError(reason instanceof Error ? reason.message : '안내를 불러오지 못했습니다.') }
  }
  const cancelWithdrawal = () => { ++optionsRequest.current; setConfirming(false); setRetainForRecovery(false); setOptions(null); setError(null) }
  useEffect(() => () => { ++optionsRequest.current }, [])
  useEffect(() => {
    void fetchPolicyConsentStatus()
      .then((status) => setAgreements(status.agreedPolicies))
      .catch(() => setError('약관 동의 내역을 불러오지 못했습니다.'))
      .finally(() => setAgreementsLoading(false))
  }, [])
  const submit = async () => {
    if (isSubmitting || !options?.enabled) return
    setIsSubmitting(true); setError(null)
    try {
      const result = await withdrawAccount(retainForRecovery, retainForRecovery ? options?.consentVersion : undefined)
      onWithdrawn(result.erasurePending ? '탈퇴가 완료됐어요. 정보 파기는 아직 처리 대기 중입니다.' : retainForRecovery
        ? `탈퇴가 완료됐어요. 복구 가능 기한: ${result.purgeAfter ? new Date(result.purgeAfter).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '3개월 후'} (한국시간). 기한이 지나면 복구할 수 없고 정기 작업에서 파기합니다.` : '탈퇴 및 서비스 DB의 회원정보 파기가 완료됐어요. 백업·재생 방지 기록은 별도 보관·파기 절차로 관리합니다.')
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : '회원 탈퇴를 처리하지 못했습니다.'); setIsSubmitting(false) }
  }
  const panel = <section className={embedded ? 'account-embedded' : 'account-dialog'} role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : true} aria-labelledby="account-title" aria-busy={isSubmitting}>
      {embedded ? <HistoryHeading title="계정 관리" id="account-title" onClose={onClose} closeDisabled={isSubmitting} /> : <><button type="button" className="login-modal-close" disabled={isSubmitting} onClick={onClose} aria-label="계정 창 닫기">×</button><p>급똥 계정</p><h1 id="account-title">내 계정</h1></>}
      <dl className="account-profile-details"><div><dt>이름</dt><dd>{profile.displayName || '이름 없음'}</dd></div><div><dt>이메일</dt><dd>{profile.email || '제공되지 않음'}</dd></div></dl>
      <section className="account-agreements-inline" aria-labelledby="agreement-title"><h2 id="agreement-title">약관 동의 내역</h2>{agreementsLoading ? <p role="status">동의 내역을 불러오는 중…</p> : agreements.length === 0 ? !error && <p>저장된 동의 내역이 없습니다.</p> : agreements.map((agreement) => <PolicyDisclosure key={`${agreement.key}-${agreement.version}-${agreement.contentPath}`} title={agreement.title} meta={`${new Date(agreement.agreedAt).toLocaleDateString('ko-KR')} 동의 · v${agreement.version}`} contentPath={agreement.contentPath} />)}</section>
      {!confirming && <button type="button" className="account-withdraw" onClick={() => void openWithdrawal()}>회원 탈퇴</button>}
      {confirming && <div className="account-confirm"><strong>정말 탈퇴할까요?</strong>
        {!options && !error && <p role="status">탈퇴 안내를 불러오는 중…</p>}
        <p>로그인이 해제되고 제보 작성자는 ‘탈퇴한 사용자’로 표시됩니다. 제보의 화장실 수정 정보는 남습니다.</p>
        <label className="withdrawal-choice"><input type="checkbox" checked={retainForRecovery} disabled={isSubmitting || !options?.enabled}
          onChange={event => setRetainForRecovery(event.target.checked)} /><span>[선택] 3개월간 계정 복구를 위한 정보 보관에 동의합니다.</span></label>
        <p className="withdrawal-details">목적: 동일 소셜 계정 인증 후 기존 계정·제보 연결 복구. 항목: 소셜 제공자와 보호된 식별자, 닉네임, 회원·제보 연결 정보, 탈퇴·동의·삭제 예정 시각. 이메일과 로그인 토큰은 복구용으로 보관하지 않습니다.</p>
        {options && <p className="withdrawal-details">선택 시 복구 가능 기한: {new Date(options.purgeAfter).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (한국시간, 접수 시각에 따라 최종 확정). 기한 이후에는 복구할 수 없고 정기 작업에서 파기합니다. 보관 중에도 동일 소셜 로그인 후 삭제를 요청할 수 있습니다.</p>}
        <p>선택하지 않으면 회원정보와 제보의 회원 연결·자유 입력 사유를 파기하며 복구할 수 없습니다. 탈퇴에는 동의 거부에 따른 불이익이 없습니다.</p>
        {options && !options.enabled && <p role="status">탈퇴 기능 점검 중입니다. <a href="mailto:privacy@geupddong.com">개인정보 문의</a>로 요청해 주세요.</p>}
        <AccountErasureNotice />
        <div><button type="button" disabled={isSubmitting} onClick={cancelWithdrawal}>취소</button><button type="button" disabled={isSubmitting || !options?.enabled} onClick={() => void submit()}>{isSubmitting ? '처리 중…' : retainForRecovery ? '복구 정보 보관하고 탈퇴' : '정보 파기 요청하고 탈퇴'}</button></div>
      </div>}
      {error && <p className="consent-error" role="alert">{error} <a href="mailto:privacy@geupddong.com">개인정보 문의</a></p>}
    </section>
  return embedded ? panel : <div className="account-backdrop" onMouseDown={(event) => { if (!isSubmitting && event.target === event.currentTarget) onClose() }}>{panel}</div>
}
