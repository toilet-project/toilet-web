'use client'

import { useLocale } from '../../i18n/context'
import { regionText } from './regionText'

export function RegionLoading() {
  const locale = useLocale()
  const t = regionText(locale)
  return <main className="region-main region-loading" aria-busy="true">
      <p className="region-loading-label" role="status">{t.loading}</p>
      <div className="region-loading-title" aria-hidden="true" />
      <div className="region-loading-grid" aria-hidden="true"><div /></div>
    </main>
}
