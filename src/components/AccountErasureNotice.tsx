import { useLocale, useMessages } from '../i18n/context'
import { localizedPublicPath } from '../i18n/routes'
/** Recovery data and local anti-resurrection records have separate lifecycles. */
export function AccountErasureNotice() {
  const t = useMessages(), locale = useLocale()
  return <details className="account-erasure-notice">
    <summary>{t('erasure.title')}</summary>
    <p>{t('erasure.scope')}</p>
    <p>{t('erasure.records')}</p>
    <a href={localizedPublicPath('/policies/privacy#erasure-records', locale)!} target="_blank" rel="noreferrer">{t('erasure.link')}</a>
    {' · '}<a href="mailto:privacy@geupddong.com">{t('account.contact')}</a>
  </details>
}
