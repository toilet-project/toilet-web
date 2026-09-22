'use client'

import { useMessages } from '../i18n/context'
import { LocalizedPolicyFooter } from './LocalizedPolicyFooter'

export function SiteFooter({ hint }: { hint?: string }) {
  const t = useMessages()
  return <footer className="site-footer public-site-footer"><div className="public-site-footer-inner"><p>{hint ?? t('map.footer')}</p><LocalizedPolicyFooter /></div></footer>
}
