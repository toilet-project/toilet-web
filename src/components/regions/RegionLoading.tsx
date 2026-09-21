'use client'

import { usePathname } from 'next/navigation'
import { useLocale } from '../../i18n/context'
import { parseLocalizedPublicPath } from '../../i18n/routes'
import { SiteHeader } from '../SiteHeader'
import { regionText } from './regionText'

export function RegionLoading() {
  const locale = useLocale()
  const path = parseLocalizedPublicPath(usePathname() ?? '/regions')?.path ?? '/regions'
  const t = regionText(locale)
  return <div className="region-site-shell">
    <SiteHeader path={path} />
    <main className="region-main region-loading" aria-busy="true">
      <p className="region-loading-label" role="status">{t.loading}</p>
      <div className="region-loading-title" aria-hidden="true" />
      <div className="region-loading-grid" aria-hidden="true"><div /><div /></div>
    </main>
  </div>
}
