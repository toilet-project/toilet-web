'use client'

import { usePathname } from 'next/navigation'
import { useLocale } from '../../i18n/context'
import { parseLocalizedPublicPath } from '../../i18n/routes'
import outlineAssets from '../../../data/regions/outline-assets.json' with { type: 'json' }
import { regionText } from './regionText'

export function RegionLoading() {
  const locale = useLocale()
  const t = regionText(locale)
  const path = parseLocalizedPublicPath(usePathname() ?? '/regions')?.path ?? '/regions'
  const districtSegment = path.split('/')[3] ?? ''
  const code = districtSegment.match(/-(\d{5})$/)?.[1]
  const asset = code ? outlineAssets[code as keyof typeof outlineAssets] : undefined
  let name = ''
  if (asset) {
    try { name = decodeURIComponent(districtSegment.slice(0, -(code!.length + 1))).replaceAll('-', ' ') }
    catch { name = '' }
  }
  if (asset && name) return <main className="region-main region-loading" aria-busy="true">
    <div className="region-hero"><div className="region-hero-copy">
      <div className="region-hero-heading"><h1>{name}</h1></div><p>{t.intro}</p>
    </div></div>
    <section className="region-district-layout" aria-label={name}><div className="region-district-map-card">
      <div className="region-card-heading"><span className="region-eyebrow">{t.locationMap}</span><h2>{name}</h2></div>
      <div className="district-map-wrap region-district-loading" role="status" aria-label={t.loading}>
        <img src={asset} alt="" /><span>{t.loading}</span>
      </div>
    </div></section>
  </main>
  return <main className="region-main region-loading" aria-busy="true">
      <p className="region-loading-label" role="status">{t.loading}</p>
      <div className="region-loading-title" aria-hidden="true" />
      <div className="region-loading-grid" aria-hidden="true"><div /></div>
    </main>
}
