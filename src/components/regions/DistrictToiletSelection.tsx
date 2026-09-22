'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchToiletDetail, type ToiletDetailResponse, type ToiletMapItemResponse } from '../../api/toilets'
import type { Locale } from '../../i18n/locale'
import { useMessages } from '../../i18n/context'
import { toiletTypeLabel } from '../../i18n/facilityLabels'
import { localizeToiletDetail, localizeToiletMapItem } from '../../i18n/toiletTranslations'
import { localizedPublicPath } from '../../i18n/routes'
import { regionToiletPath } from '../../lib/regionToiletPath'
import { formatOpenTime } from '../../lib/detailFormatting'
import { ToiletDetailContents } from '../ToiletDetailContents'
import { OriginalSourceBadge } from '../OriginalSourceBadge'
import { PublicReviews } from '../reviews/PublicReviews'
import { regionText } from './regionText'

export function DistrictToiletSelection({ toilets, locale, onClose }: { toilets: ToiletMapItemResponse[]; locale: Locale; onClose: () => void }) {
  const t = useMessages()
  const r = regionText(locale)
  const [activeId, setActiveId] = useState<number | null>(toilets.length === 1 ? toilets[0].id : null)
  const [detail, setDetail] = useState<ToiletDetailResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [desktop, setDesktop] = useState(false)
  const active = toilets.find(toilet => toilet.id === activeId)
  const display = active ? localizeToiletMapItem(active, locale) : null
  const loaded = detail?.id === activeId ? localizeToiletDetail(detail, locale) : null

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px), (max-width: 1024px) and (max-height: 500px) and (pointer: coarse)')
    const update = () => setDesktop(!media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (activeId == null) return
    const abort = new AbortController()
    // Only the chosen facility is fetched, never every facility in the district.
    void fetchToiletDetail(activeId, abort.signal).then(value => {
      if (!abort.signal.aborted) setDetail(value)
    }).catch(() => { if (!abort.signal.aborted) setFailed(true) })
    return () => abort.abort()
  }, [activeId, attempt])
  useEffect(() => {
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [onClose])
  function choose(id: number | null) { setFailed(false); setDetail(null); setActiveId(id) }

  return <aside className={`district-map-selection${active ? ' is-facility' : ''}`} aria-label={t('detail.title')}>
    <button type="button" className="region-selection-close" onClick={onClose} aria-label={r.closeSelection}>×</button>
    {active && display ? <>
      <header className="district-selection-heading">
        {toilets.length > 1 && <button type="button" className="district-selection-back" onClick={() => choose(null)}>{t('common.back')}</button>}
        <div className="card-label-row"><span className="card-label">{toiletTypeLabel(loaded?.toiletType || display.toiletType, locale)}</span><OriginalSourceBadge toilet={loaded} locale={locale} /></div>
        <h2>{loaded?.name || display.name}</h2>
      </header>
      <div className="district-selection-content" aria-busy={!loaded && !failed}>
        {loaded ? <p className="district-selection-hours">{formatOpenTime(loaded, locale)}</p>
          : failed ? <div className="district-selection-error" role="alert"><p>{t('detail.error')}</p><button type="button" onClick={() => { setFailed(false); setAttempt(value => value + 1) }}>{t('common.retry')}</button></div>
            : <p className="district-selection-hours is-loading" role="status">{t('detail.openingLoading')}</p>}
        {desktop && loaded && <>
          <PublicReviews toiletId={loaded.id} toiletName={loaded.name} toiletType={loaded.toiletType} />
          <ToiletDetailContents toilet={loaded} />
        </>}
      </div>
      <Link className="district-selection-link" href={localizedPublicPath(regionToiletPath(active), locale)!}>{t('detail.show')}<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></Link>
    </> : <>
      <header className="district-selection-heading"><span className="card-label">{toilets.length.toLocaleString(locale)} {r.toilets}</span><h2>{localizeToiletMapItem(toilets[0], locale).displayGroupName || r.restroomList}</h2></header>
      <div className="district-selection-facilities">{toilets.map(toilet => <button key={toilet.id} type="button" onClick={() => choose(toilet.id)}><strong>{localizeToiletMapItem(toilet, locale).name}</strong><span>{t('detail.show')}</span></button>)}</div>
    </>}
  </aside>
}
