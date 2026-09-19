import { useLocale, useMessages } from '../i18n/context'
import { useEffect, useRef, useState } from 'react'
import { fetchPolicyConsentStatus, fetchWithdrawalOptions, withdrawAccount, type AuthProfile, type PolicyAgreement, type WithdrawalOptions } from '../api/auth'
import { AccountErasureNotice } from './AccountErasureNotice'
import { HistoryHeading } from './HistoryControls'
import { PolicyDisclosure } from './PolicyDisclosure'
import { accountDate, accountError, policyTitle } from '../i18n/accountLabels'

export function AccountDialog({ profile, onClose, onWithdrawn, embedded = false }: { profile: AuthProfile; onClose: () => void; onWithdrawn: (message: string) => void; embedded?: boolean }) {
  const locale = useLocale(), t = useMessages()
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
    catch (reason) { if (request === optionsRequest.current) setError(accountError(reason, locale, 'account.withdrawLoadError')) }
  }
  const cancelWithdrawal = () => { ++optionsRequest.current; setConfirming(false); setRetainForRecovery(false); setOptions(null); setError(null) }
  useEffect(() => () => { ++optionsRequest.current }, [])
  useEffect(() => {
    let active = true
    void fetchPolicyConsentStatus()
      .then((status) => { if (active) setAgreements(status.agreedPolicies) })
      .catch(() => { if (active) setError(t('account.agreementsError')) })
      .finally(() => { if (active) setAgreementsLoading(false) })
    return () => { active = false }
  }, [t])
  const submit = async () => {
    if (isSubmitting || !options?.enabled) return
    setIsSubmitting(true); setError(null)
    try {
      const result = await withdrawAccount(retainForRecovery, retainForRecovery ? options?.consentVersion : undefined)
      onWithdrawn(result.erasurePending ? t('account.closedPending') : retainForRecovery
        ? t('account.closedRetained', { date: result.purgeAfter ? accountDate(result.purgeAfter, locale) : t('account.threeMonths') }) : t('account.closedErased'))
    }
    catch (reason) { setError(accountError(reason, locale, 'account.withdrawError')); setIsSubmitting(false) }
  }
  const panel = <section className={embedded ? 'account-embedded' : 'account-dialog'} role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : true} aria-labelledby="account-title" aria-busy={isSubmitting}>
      {embedded ? <HistoryHeading title={t('account.manage')} id="account-title" onClose={onClose} closeDisabled={isSubmitting} /> : <><button type="button" className="login-modal-close" disabled={isSubmitting} onClick={onClose} aria-label={t('account.close')}>×</button><p>{t('account.brand')}</p><h1 id="account-title">{t('auth.account')}</h1></>}
      <dl className="account-profile-details"><div><dt>{t('account.name')}</dt><dd>{profile.displayName || t('account.noName')}</dd></div><div><dt>{t('account.email')}</dt><dd>{profile.email || t('account.notProvided')}</dd></div></dl>
      <section className="account-agreements-inline" aria-labelledby="agreement-title"><h2 id="agreement-title">{t('account.agreements')}</h2>{agreementsLoading ? <p role="status">{t('account.agreementsLoading')}</p> : agreements.length === 0 ? !error && <p>{t('account.agreementsEmpty')}</p> : agreements.map((agreement) => <PolicyDisclosure key={`${agreement.key}-${agreement.version}-${agreement.contentPath}`} title={policyTitle(locale, agreement.key, agreement.title)} meta={t('account.agreedAt', { date: accountDate(agreement.agreedAt, locale, true), version: agreement.version })} contentPath={agreement.contentPath} version={agreement.version} />)}</section>
      {!confirming && <button type="button" className="account-withdraw" onClick={() => void openWithdrawal()}>{t('account.withdraw')}</button>}
      {confirming && <div className="account-confirm"><strong>{t('account.withdrawTitle')}</strong>
        {!options && !error && <p role="status">{t('account.withdrawLoading')}</p>}
        <p>{t('account.withdrawIntro')}</p>
        <label className="withdrawal-choice"><input type="checkbox" checked={retainForRecovery} disabled={isSubmitting || !options?.enabled}
          onChange={event => setRetainForRecovery(event.target.checked)} /><span>{t('account.retainChoice')}</span></label>
        <p className="withdrawal-details">{t('account.retainDetails')}</p>
        {options && <p className="withdrawal-details">{t('account.retainDeadline', { date: accountDate(options.purgeAfter, locale) })}</p>}
        <p>{t('account.noRetention')}</p>
        {options && !options.enabled && <p role="status">{t('account.unavailable')} <a href="mailto:privacy@geupddong.com">{t('account.contact')}</a> {t('account.contactRequest')}</p>}
        <AccountErasureNotice />
        <div><button type="button" disabled={isSubmitting} onClick={cancelWithdrawal}>{t('common.cancel')}</button><button type="button" disabled={isSubmitting || !options?.enabled} onClick={() => void submit()}>{isSubmitting ? t('common.processing') : retainForRecovery ? t('account.retainAndClose') : t('account.eraseAndClose')}</button></div>
      </div>}
      {error && <p className="consent-error" role="alert">{error} <a href="mailto:privacy@geupddong.com">{t('account.contact')}</a></p>}
    </section>
  return embedded ? panel : <div className="account-backdrop" onMouseDown={(event) => { if (!isSubmitting && event.target === event.currentTarget) onClose() }}>{panel}</div>
}
