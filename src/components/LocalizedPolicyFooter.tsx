'use client'
import { useLocale, useMessages } from '../i18n/context'
import { localizedPublicPath } from '../i18n/routes'

export function LocalizedPolicyFooter() {
  const t = useMessages(), locale = useLocale()
  return <div className="policy-footer"><nav aria-label={t('policy.links')}><a href={localizedPublicPath('/policies/terms', locale)!}>{t('menu.terms')}</a><a href={localizedPublicPath('/policies/privacy', locale)!}>{t('menu.privacy')}</a><a href={localizedPublicPath('/policies/location', locale)!}>{t('menu.location')}</a><a href="mailto:privacy@geupddong.com">{t('menu.contact')}</a></nav><small>© 2026 급똥</small></div>
}
