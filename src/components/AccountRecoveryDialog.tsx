import { useEffect, useState } from 'react'
import { cancelRecovery, decideRecovery, fetchRecoveryStatus, type RecoveryStatus } from '../api/auth'
import { AccountErasureNotice } from './AccountErasureNotice'
import { useLocale, useMessages } from '../i18n/context'
import { accountDate, accountError } from '../i18n/accountLabels'
import { localizedPublicPath } from '../i18n/routes'
import { BrandWordmark } from './BrandWordmark'

export function AccountRecoveryDialog() {
  const locale = useLocale(), t = useMessages()
  const home = localizedPublicPath('/', locale)!
  const [status, setStatus] = useState<RecoveryStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [eraseConfirmed, setEraseConfirmed] = useState(false)
  const [finished, setFinished] = useState('')
  useEffect(() => {
    let active = true
    void fetchRecoveryStatus().then(value => { if (active) setStatus(value) })
      .catch(reason => { if (active) setError(accountError(reason, locale, 'recovery.loadError')) })
    return () => { active = false }
  }, [locale])
  const decide = async (action: 'RESTORE' | 'ERASE') => {
    if (busy || !status || (action === 'ERASE' && !eraseConfirmed)) return
    setBusy(true); setError('')
    try {
      const result = await decideRecovery(action)
      if (action === 'RESTORE') window.location.replace(home + '?login=success&consent=required')
      else setFinished(result.erasurePending ? t('recovery.erasurePending') : t('recovery.erased'))
    } catch (reason) { setError(accountError(reason, locale, 'recovery.actionError')) }
    finally { setBusy(false) }
  }
  const close = async () => {
    setBusy(true)
    try { await cancelRecovery(); window.location.replace(home) }
    catch (reason) { setError(accountError(reason, locale, 'recovery.closeError')); setBusy(false) }
  }
  return <div className="account-backdrop"><section className="account-dialog account-recovery" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
    <p className="policy-brand" aria-label={locale === 'en' ? 'Geupddong' : '급똥'}><BrandWordmark locale={locale} /></p><h1 id="recovery-title">{t('recovery.title')}</h1>
    {finished ? <><p role="status">{finished}</p><AccountErasureNotice /><a href={home}>{t('detail.back')}</a></> : <>
      {status && <p>{t('recovery.verified')}</p>}
      {status && <><p>{t('recovery.intro', { name: status.displayName || t('recovery.previous') })}</p>
        <p>{t('recovery.deadline', { date: accountDate(status.purgeAfter, locale) })}</p>
        <div className="recovery-actions"><button type="button" className="recovery-primary" disabled={busy} onClick={() => void decide('RESTORE')}>{t('recovery.restore')}</button>
          {!eraseConfirmed ? <button type="button" className="recovery-delete" disabled={busy} onClick={() => setEraseConfirmed(true)}>{t('recovery.erase')}</button> : <><p>{t('recovery.eraseWarning')}</p><button type="button" className="recovery-delete" disabled={busy} onClick={() => void decide('ERASE')}>{t('recovery.confirmErase')}</button><button type="button" disabled={busy} onClick={() => setEraseConfirmed(false)}>{t('recovery.cancelErase')}</button></>}
        </div><AccountErasureNotice /></>}
      {!status && !error && <p role="status">{t('recovery.checking')}</p>}
      <button type="button" className="recovery-cancel" disabled={busy} onClick={() => void close()}>{t('recovery.notNow')}</button>
    </>}
    {error && <p className="consent-error" role="alert">{error} <a href="mailto:privacy@geupddong.com">{t('account.contact')}</a></p>}
  </section></div>
}
