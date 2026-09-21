'use client'
import { useSyncExternalStore } from 'react'
import { useLocale, useMessages } from '../i18n/context'
import { localizedPublicPath } from '../i18n/routes'
import { isLocale, type Locale } from '../i18n/locale'
import { koreanPolicySourcePath } from '../i18n/policyReturn'

const subscribe = () => () => {}
const serverReturn = (): Locale | '' => ''
function requestedReturn(): Locale | '' {
  const value = new URLSearchParams(window.location.search).get('return')
  return isLocale(value) && value !== 'ko' ? value : ''
}

export function LocalizedPolicyFooter() {
  const t = useMessages(), locale = useLocale()
  const returnLocale = useSyncExternalStore(subscribe, requestedReturn, serverReturn)
  const path = (kind: 'terms' | 'privacy' | 'location') => locale === 'ko' && returnLocale
    ? koreanPolicySourcePath(`/policies/${kind}`, returnLocale) : localizedPublicPath(`/policies/${kind}`, locale)!
  return <div className="policy-footer"><nav aria-label={t('policy.links')}><a href={path('terms')}>{t('menu.terms')}</a><a href={path('privacy')}>{t('menu.privacy')}</a><a href={path('location')}>{t('menu.location')}</a><a href="mailto:privacy@geupddong.com">{t('menu.contact')}</a></nav><small>© 2026 {locale === 'ko' ? '급똥' : 'Geupddong'}</small></div>
}
