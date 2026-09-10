import { useEffect, useState } from 'react'
import { cancelRecovery, decideRecovery, fetchRecoveryStatus, type RecoveryStatus } from '../api/auth'
import { AccountErasureNotice } from './AccountErasureNotice'

export function AccountRecoveryDialog() {
  const [status, setStatus] = useState<RecoveryStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [eraseConfirmed, setEraseConfirmed] = useState(false)
  const [finished, setFinished] = useState('')
  useEffect(() => {
    let active = true
    void fetchRecoveryStatus().then(value => { if (active) setStatus(value) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '확인하지 못했어요.') })
    return () => { active = false }
  }, [])
  const decide = async (action: 'RESTORE' | 'ERASE') => {
    if (busy || !status || (action === 'ERASE' && !eraseConfirmed)) return
    setBusy(true); setError('')
    try {
      const result = await decideRecovery(action)
      if (action === 'RESTORE') window.location.replace('/?login=success&consent=required')
      else setFinished(result.erasurePending ? '삭제 요청을 접수했어요. 복구는 중지됐으며 정보 파기는 아직 처리 대기 중입니다.' : '서비스 DB의 회원정보를 파기했어요. 같은 계정으로 가입해도 이전 제보는 연결되지 않습니다.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '처리하지 못했어요.') }
    finally { setBusy(false) }
  }
  const close = async () => {
    setBusy(true)
    try { await cancelRecovery(); window.location.replace('/') }
    catch (reason) { setError(reason instanceof Error ? reason.message : '종료하지 못했어요.'); setBusy(false) }
  }
  return <div className="account-backdrop"><section className="account-dialog account-recovery" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
    <p className="policy-brand">급똥</p><h1 id="recovery-title">이전 계정을 복구할까요?</h1>
    {finished ? <><p role="status">{finished}</p><AccountErasureNotice /><a href="/">지도로 돌아가기</a></> : <>
      {status && <p>같은 소셜 계정이 확인됐어요. 복구를 선택하기 전에는 로그인되지 않습니다.</p>}
      {status && <><p>{status.displayName || '이전 계정'}의 계정과 제보 연결을 복구할 수 있어요. 관리자 권한은 복구되지 않으며, 필수 약관을 다시 확인합니다.</p>
        <p>복구 가능 기한: {new Date(status.purgeAfter.endsWith('Z') || /[+-]\d\d:\d\d$/.test(status.purgeAfter) ? status.purgeAfter : `${status.purgeAfter}+09:00`).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (한국시간). 기한 이후에는 복구할 수 없고 정기 작업에서 파기합니다.</p>
        <div className="recovery-actions"><button type="button" className="recovery-primary" disabled={busy} onClick={() => void decide('RESTORE')}>이전 계정 복구</button>
          {!eraseConfirmed ? <button type="button" className="recovery-delete" disabled={busy} onClick={() => setEraseConfirmed(true)}>복구 없이 삭제 요청</button> : <><p>요청 후에는 복구가 중지되고 회원정보와 제보의 회원 연결·자유 입력 사유를 파기합니다. 처리 대기가 발생할 수 있으며 되돌릴 수 없어요.</p><button type="button" className="recovery-delete" disabled={busy} onClick={() => void decide('ERASE')}>확인했어요, 삭제 요청</button><button type="button" disabled={busy} onClick={() => setEraseConfirmed(false)}>삭제 요청 취소</button></>}
        </div><AccountErasureNotice /></>}
      {!status && !error && <p role="status">확인 중…</p>}
      <button type="button" className="recovery-cancel" disabled={busy} onClick={() => void close()}>지금은 복구하지 않기</button>
    </>}
    {error && <p className="consent-error" role="alert">{error} <a href="mailto:privacy@geupddong.com">개인정보 문의</a></p>}
  </section></div>
}
