'use client'
import { useMessages } from '../i18n/context'

// Policy bodies remain the reviewed Korean originals in phase-one preview.
export function LocalizedPolicyFooter() {
  const t = useMessages()
  return <div className="policy-footer"><nav aria-label={t('policy.links')}><a href="/policies/terms">{t('menu.terms')}</a><a href="/policies/privacy">{t('menu.privacy')}</a><a href="/policies/location">{t('menu.location')}</a><a href="mailto:privacy@geupddong.com">{t('menu.contact')}</a></nav><small>© 2026 급똥</small></div>
}
