'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { Region } from '../../lib/regions'
import type { Locale } from '../../i18n/locale'
import type { RegionMarkerItem } from '../../lib/regionDisplayItems'
import { loadDistrictBoundary, loadDistrictMarkers } from '../../lib/regionNavigationClient'
import { localizedPublicPath } from '../../i18n/routes'
import { regionToiletPathForDistrict } from '../../lib/regionToiletPath'
import { DistrictNaverMap } from './DistrictNaverMap'
import { regionText } from './regionText'
import { useMessages } from '../../i18n/context'
import outlineAssets from '../../../data/regions/outline-assets.json' with { type: 'json' }

export function DistrictMapData({ district, locale, directory }: { district: Region; locale: Locale; directory?: ReactNode }) {
  const t = regionText(locale), message = useMessages()
  const [precise, setPrecise] = useState<Region | null>(null)
  const [toilets, setToilets] = useState<RegionMarkerItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    void import('../../lib/mapProvider').then(module => module.prepareNaverMap(locale)).catch(() => {})
    void loadDistrictBoundary(district.code).then(geometry => { if (active) setPrecise({ ...district, geometry }) })
      .catch(() => { if (active) setFailed(true) })
    void loadDistrictMarkers(district.code, locale).then(data => { if (active) setToilets(data) })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [district, locale, attempt])
  return <>
    {precise ? <DistrictNaverMap district={precise} toilets={toilets ?? []} locale={locale} loading={toilets === null} failed={failed} />
      : <div className="district-map-wrap region-district-loading" role="status" aria-label={t.loading}>
        <img src={outlineAssets[district.code as keyof typeof outlineAssets]} alt="" /><span>{t.loading}</span>
      </div>}
    {failed && <p role="alert">{t.error} <button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1) }}>{message('common.retry')}</button></p>}
    {directory ?? (toilets && toilets.length > 0 && <details className="region-facility-directory"><summary>{t.restroomList} ({toilets.length.toLocaleString(locale)})</summary>
      <nav aria-label={t.nearby}><ul>{[...toilets].sort((a, b) => a.name.localeCompare(b.name, locale) || a.id - b.id).map(toilet =>
        <li key={toilet.id}><a href={localizedPublicPath(regionToiletPathForDistrict({ ...toilet, name: toilet.canonicalName }, locale, district.code), locale)!}>{toilet.name}</a></li>)}</ul></nav>
    </details>)}
  </>
}
