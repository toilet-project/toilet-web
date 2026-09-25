'use client'

import { useLocale, useMessages } from '../i18n/context'
import { HomeIntro } from './HomeIntro'
import { LocalizedPolicyFooter } from './LocalizedPolicyFooter'

export function SiteFooter({ hint, homeIntro = false }: { hint?: string; homeIntro?: boolean }) {
  const t = useMessages(), locale = useLocale()
  return <footer className={`site-footer public-site-footer${homeIntro ? ' has-home-intro' : ''}`}><div className="public-site-footer-inner">{homeIntro && <HomeIntro locale={locale} compact />}<p>{hint ?? t('map.footer')}</p><LocalizedPolicyFooter /></div></footer>
}
