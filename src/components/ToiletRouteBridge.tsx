'use client'

import { useLayoutEffect } from 'react'
import Link from 'next/link'
import type { ToiletDetailResponse } from '../api/toilets'
import { useMapRouteContext } from './mapRouteContext'
import { ToiletDetailContents } from './ToiletDetailContents'
import { ToiletCommunityRow, ToiletReportEntry } from './ToiletCommunityRow'
import { formatOpenTime } from '../lib/detailFormatting'
import { toiletPath } from '../lib/toiletRoute'

export function ToiletRouteBridge({ detail }: { detail: ToiletDetailResponse | null }) {
  const { mounted, register } = useMapRouteContext()
  const path = detail ? toiletPath(detail.id) : '/'
  useLayoutEffect(() => { register({ path, detail }) }, [detail, path, register])

  // Visible initial card, then the same data/component in the existing interactive map card.
  if (!detail || mounted) return null
  return <div className="route-card-stage"><aside className="place-card initial-route-card route-preview-card" aria-label="화장실 상세 정보">
    <Link href="/" className="close-button" aria-label="정보 닫기">×</Link>
    <button type="button" className="mobile-card-handle" disabled aria-expanded={false}>상세 정보 보기</button>
    <div className="place-card-summary"><span className="card-label">{detail.toiletType || '화장실'}</span>{process.env.NEXT_PUBLIC_REVIEW_DESIGN_PREVIEW === 'true' ? <div className="review-card-title-row"><h1>{detail.name}</h1><ToiletReportEntry disabled /></div> : <h1>{detail.name}</h1>}</div>
    <div className="card-scroll-content">
      <p className="open-time">{formatOpenTime(detail)}</p>
      <div className="distance-from-current" aria-label="거리 계산 중"><span className="distance-label">기준점에서 약</span><strong className="distance-value">—</strong><span className="distance-caption">(직선거리)</span></div>
      <div className="route-preview-community"><ToiletCommunityRow pendingReport pendingReview={process.env.NEXT_PUBLIC_REVIEW_DESIGN_PREVIEW === 'true'} /></div>
      <ToiletDetailContents toilet={detail} />
    </div>
  </aside></div>
}
