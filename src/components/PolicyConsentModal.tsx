import { useEffect, useMemo, useState } from 'react'
import { agreeToRequiredPolicies, fetchPolicies, type PolicyDocument, type PolicyKey } from '../api/auth'

export function PolicyConsentModal({ isNewRegistration, onComplete, onLogout }: {
  isNewRegistration: boolean
  onComplete: () => void
  onLogout: () => void
}) {
  const [policies, setPolicies] = useState<PolicyDocument[]>([])
  const [checked, setChecked] = useState<Set<PolicyKey>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    void fetchPolicies().then(setPolicies).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '약관을 불러오지 못했습니다.'))
  }, [])

  const required = useMemo(() => policies.filter((policy) => policy.required), [policies])
  const allChecked = required.length > 0 && required.every((policy) => checked.has(policy.key))
  const toggle = (key: PolicyKey) => setChecked((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  const submit = async () => {
    if (!allChecked) return
    setIsSaving(true); setError(null)
    try {
      await agreeToRequiredPolicies(required.map((policy) => policy.key))
      onComplete()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '약관 동의를 저장하지 못했습니다.')
    } finally { setIsSaving(false) }
  }

  return <div className="consent-backdrop">
    <section className="consent-modal" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <p className="consent-eyebrow">{isNewRegistration ? '가입 마지막 단계' : '약관 업데이트'}</p>
      <h1 id="consent-title">{isNewRegistration ? '급똥 가입을 위한 동의가 필요해요' : '계속 이용하려면 동의가 필요해요'}</h1>
      <p>지도 조회는 로그인 없이 이용할 수 있고, 아래 동의 후 제보와 내 제보 기능을 이용할 수 있습니다.</p>
      <label className="consent-all"><input type="checkbox" checked={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(required.map((policy) => policy.key)))} /><strong>필수 항목 모두 동의</strong></label>
      <div className="consent-list">
        {required.map((policy) => <label key={policy.id}><input type="checkbox" checked={checked.has(policy.key)} onChange={() => toggle(policy.key)} /><span><strong>[필수] {policy.title}</strong><small>v{policy.version} · {policy.effectiveAt}</small></span><a href={policy.contentPath} target="_blank" rel="noreferrer" aria-label={`${policy.title} 전문 보기`}>보기</a></label>)}
      </div>
      <p className="consent-age-note">만 14세 이상 확인은 신규 회원가입 시 한 번만 기록하며, 일반 로그인 때마다 다시 요청하지 않습니다.</p>
      {error && <p className="consent-error" role="alert">{error}</p>}
      <button type="button" className="consent-submit" disabled={!allChecked || isSaving} onClick={() => void submit()}>{isSaving ? '저장 중…' : '동의하고 시작하기'}</button>
      <button type="button" className="consent-logout" onClick={onLogout}>동의하지 않고 로그아웃</button>
    </section>
  </div>
}
