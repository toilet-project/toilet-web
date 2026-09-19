import { useLocale, useMessages } from '../i18n/context'
import { useEffect, useMemo, useState } from 'react'
import { agreeToRequiredPolicies, fetchPolicies, type PolicyDocument, type PolicyKey } from '../api/auth'
import { PolicyDisclosure } from './PolicyDisclosure'
import { accountError, policyTitle } from '../i18n/accountLabels'

export function PolicyConsentModal({ isNewRegistration, onComplete, onLogout }: {
  isNewRegistration: boolean
  onComplete: () => void
  onLogout: () => void
}) {
  const locale = useLocale(), t = useMessages()
  const [policies, setPolicies] = useState<PolicyDocument[]>([])
  const [checked, setChecked] = useState<Set<PolicyKey>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let active = true
    void fetchPolicies().then(value => { if (active) setPolicies(value) }).catch((reason: unknown) => { if (active) setError(accountError(reason, locale, 'consent.loadError')) })
    return () => { active = false }
  }, [locale])

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
      setError(accountError(reason, locale, 'consent.saveError'))
    } finally { setIsSaving(false) }
  }

  return <div className="consent-backdrop">
    <section className="consent-modal" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <p className="consent-eyebrow">{isNewRegistration ? t('consent.signupStep') : t('consent.update')}</p>
      <h1 id="consent-title">{isNewRegistration ? t('consent.signupTitle') : t('consent.updateTitle')}</h1>
      <p className="consent-description">{t('consent.description')}</p>
      <label className="consent-all"><input type="checkbox" checked={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(required.map((policy) => policy.key)))} /><strong>{t('consent.all')}</strong></label>
      <div className="consent-list">
        {required.map((policy) => <PolicyDisclosure key={`${policy.id}-${policy.version}-${policy.contentPath}`} title={t('consent.item', { title: policyTitle(locale, policy.key, policy.title) })} meta={`v${policy.version} · ${policy.effectiveAt}`} contentPath={policy.contentPath} version={policy.version} selection={<label className="policy-consent-selection"><input type="checkbox" aria-label={t('consent.agreeItem', { title: policyTitle(locale, policy.key, policy.title) })} checked={checked.has(policy.key)} onChange={() => toggle(policy.key)} /></label>} />)}
      </div>
      <p className="consent-age-note">{t('consent.ageNote')}</p>
      {error && <p className="consent-error" role="alert">{error}</p>}
      <button type="button" className="consent-submit" disabled={!allChecked || isSaving} onClick={() => void submit()}>{isSaving ? t('common.saving') : t('consent.submit')}</button>
      <button type="button" className="consent-logout" onClick={onLogout}>{t('consent.logout')}</button>
    </section>
  </div>
}
