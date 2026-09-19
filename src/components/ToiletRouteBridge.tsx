'use client'

import { useLayoutEffect } from 'react'
import Link from 'next/link'
import type { ToiletDetailResponse } from '../api/toilets'
import { useMapRouteContext } from './mapRouteContext'
import { ToiletDetailContents } from './ToiletDetailContents'
import { ToiletCommunityRow, ToiletReportEntry } from './ToiletCommunityRow'
import { PublicReviews } from './reviews/PublicReviews'
import { formatOpenTime } from '../lib/detailFormatting'
import { toiletPath } from '../lib/toiletRoute'
import { localizedPublicPath } from '../i18n/routes'
import type { Locale } from '../i18n/locale'
import { toiletTypeLabel } from '../i18n/facilityLabels'
import { message } from '../i18n/messages'

export function ToiletRouteBridge({ detail, locale = 'ko' }: { detail: ToiletDetailResponse | null; locale?: Locale }) {
  const { mounted, register } = useMapRouteContext()
  const path = localizedPublicPath(detail ? toiletPath(detail.id) : '/', locale)!
  const t = (key: Parameters<typeof message>[1]) => message(locale, key)
  const reviewsEnabled = process.env.NEXT_PUBLIC_REVIEW_DESIGN_PREVIEW === 'true' || process.env.NEXT_PUBLIC_REVIEW_API_ENABLED === 'true'
  useLayoutEffect(() => { register({ path, detail }) }, [detail, path, register])

  // Visible initial card, then the same data/component in the existing interactive map card.
  if (!detail || mounted) return null
  return <div className="route-card-stage"><aside className="place-card initial-route-card route-preview-card" aria-label={t('detail.title')}>
    <Link href={localizedPublicPath('/', locale)!} className="close-button" aria-label={t('common.close')}>×</Link>
    <button type="button" className="mobile-card-handle" disabled aria-expanded={false}>{t('detail.show')}</button>
    <div className="place-card-summary"><span className="card-label">{toiletTypeLabel(detail.toiletType, locale)}</span>{reviewsEnabled ? <div className="review-card-title-row"><h1>{detail.name}</h1><ToiletReportEntry disabled /></div> : <h1>{detail.name}</h1>}</div>
    <div className="card-scroll-content">
      <p className="open-time">{formatOpenTime(detail, locale)}</p>
      <div className="distance-from-current" aria-label={t('map.distanceLoading')}><span className="distance-label">{t('map.distanceFrom')}</span><strong className="distance-value">—</strong><span className="distance-caption">{t('map.straightLine')}</span></div>
      <div className="route-preview-community"><ToiletCommunityRow pendingReport pendingReview={reviewsEnabled} /></div>
      <PublicReviews toiletId={detail.id} toiletName={detail.name} toiletType={detail.toiletType} />
      <ToiletDetailContents toilet={detail} />
    </div>
  </aside></div>
}
