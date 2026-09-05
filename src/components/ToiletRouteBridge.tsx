'use client'

import { useLayoutEffect } from 'react'
import Link from 'next/link'
import type { ToiletDetailResponse } from '../api/toilets'
import { useMapRouteContext } from './mapRouteContext'
import { ToiletDetailContents } from './ToiletDetailContents'
import { formatOpenTime } from '../lib/detailFormatting'
import { toiletPath } from '../lib/toiletRoute'

export function ToiletRouteBridge({ detail }: { detail: ToiletDetailResponse | null }) {
  const { mounted, register } = useMapRouteContext()
  const path = detail ? toiletPath(detail.id) : '/'
  useLayoutEffect(() => { register({ path, detail }) }, [detail, path, register])

  // Visible initial card, then the same data/component in the existing interactive map card.
  if (!detail || mounted) return null
  return <aside className="place-card initial-route-card" aria-label="화장실 상세 정보">
    <Link href="/" className="close-button" aria-label="정보 닫기">×</Link>
    <h1>{detail.name}</h1>
    <p className="open-time">{formatOpenTime(detail)}</p>
    <ToiletDetailContents toilet={detail} />
  </aside>
}
