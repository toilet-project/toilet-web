'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useMessages } from '../i18n/context'
import { toiletTypeLabel } from '../i18n/facilityLabels'
import { createApiUrl } from '../config/api'
import { createReviewApi, type ReviewSummary } from '../lib/reviewApi'
import { createListReviewCache } from '../lib/listReviewCache'
import { PUBLIC_REVIEW_API_ENABLED } from '../lib/publicReviewPrefetch'

const api = createReviewApi({ url: createApiUrl, read: url => fetch(url, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10_000) }) })
const summaries = createListReviewCache(id => api.summary(id))

export function ToiletListItem({ id, name, type, count, distance, active, onSelect }: {
  id: number; name: string; type?: string; count: number; distance: string; active: boolean; onSelect: () => void
}) {
  const t = useMessages(), locale = useLocale(), root = useRef<HTMLButtonElement>(null)
  const [summary, setSummary] = useState<{ id: number; value: ReviewSummary } | null>(null)
  useEffect(() => {
    if (!PUBLIC_REVIEW_API_ENABLED || count > 1 || id <= 0 || !root.current) return
    let current = true, visible = false, timer: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      clearTimeout(timer)
      // Scrolling past a row must not fetch its review summary.
      if (visible) timer = setTimeout(() => {
        void summaries.get(id).then(value => { if (current && visible) setSummary({ id, value }) }).catch(() => undefined)
      }, 180)
    })
    observer.observe(root.current)
    return () => { current = false; observer.disconnect(); clearTimeout(timer) }
  }, [id, count])
  const review = summary?.id === id && count === 1 ? summary.value : null
  const rating = review?.averageRating ?? review?.rating
  const tone = type?.includes('개방') ? 'is-open' : type?.includes('제보') ? 'is-reported' : 'is-public'
  return <button ref={root} type="button" className={`toilet-list-item${active ? ' is-selected' : ''}`} onClick={onSelect} aria-pressed={active}>
    <span className="toilet-list-item-heading"><strong>{name || t('map.unnamed')}</strong><span className="toilet-list-distance" aria-label={`${t('map.distance')} ${distance}`}>{distance}</span></span>
    <span className="toilet-list-item-meta">
      <span className={`toilet-list-type ${tone}`}>{toiletTypeLabel(type || '공중화장실', locale)}</span>
      {count > 1 ? <span className="toilet-list-group-count">{t('map.facilities', { count })}</span> : review && <span className={`toilet-list-rating${review.count && rating != null ? ' has-rating' : ''}`} aria-label={rating != null && review.count ? t('public.summary', { rating: rating.toFixed(1), count: review.count }) : t('public.count', { count: review.count })}>
        {rating != null && review.count > 0 && <><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1z" /></svg><b>{rating.toFixed(1)}</b></>}
        <span>{t('public.count', { count: review.count.toLocaleString(locale) })}</span>
      </span>}
    </span>
  </button>
}
