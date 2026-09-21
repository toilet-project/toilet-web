'use client'
import { useLocale, useMessages } from '../../i18n/context'
import { toiletTypeLabel } from '../../i18n/facilityLabels'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { reviewAverageLabel } from '../../lib/review'
import type { StoredReview } from '../../lib/reviewApi'
import { publicPhotoPath } from '../../lib/profilePhoto'
import { cachedPublicReviews, loadPublicReviews, prefetchPublicReviews, PUBLIC_REVIEW_API_ENABLED } from '../../lib/publicReviewPrefetch'
import { trackEvent } from '../../lib/analytics'
import { PhotoImage } from '../ProfilePhoto'
import { ReviewIcon } from './ReviewDialog'

const SUMMARY_LIMIT = 3
type PublicReviewSummary = { count: number; rating: string }

export function PublicReviews({ toiletId, toiletName = '화장실', toiletType = '화장실', summary }: { toiletId: number; toiletName?: string; toiletType?: string; summary?: PublicReviewSummary }) {
  if (!PUBLIC_REVIEW_API_ENABLED || toiletId <= 0) return null
  return <PublicReviewList key={toiletId} toiletId={toiletId} toiletName={toiletName} toiletType={toiletType} summary={summary} />
}

export function PublicReviewsLoading() {
  const t = useMessages()
  if (!PUBLIC_REVIEW_API_ENABLED) return null
  return <section className="public-reviews is-loading" aria-label={t('public.loading')} aria-busy="true">
    <div className="public-review-section-heading"><h2>{t('public.title')} <span>—</span></h2></div>
    <div className="public-review-summary-panel">
      <div className="public-review-summary-list"><PublicReviewLoading /></div>
    </div>
  </section>
}

function PublicReviewList({ toiletId, toiletName, toiletType, summary }: { toiletId: number; toiletName: string; toiletType: string; summary?: PublicReviewSummary }) {
  const t = useMessages()
  const locale = useLocale()
  const initial = cachedPublicReviews(toiletId)
  const [items, setItems] = useState<StoredReview[]>(initial?.items ?? [])
  const [cursor, setCursor] = useState<string | null>(initial?.hasMore ? initial.nextCursor : null)
  const [loading, setLoading] = useState(!initial), [error, setError] = useState(false)
  const [fullView, setFullView] = useState(false), [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const section = useRef<HTMLElement>(null), backButton = useRef<HTMLButtonElement>(null)
  const active = useRef(false), epoch = useRef(0), abort = useRef<AbortController | null>(null)
  const loadingRef = useRef(false)
  const [requests] = useState(() => new Set<AbortController>())

  useEffect(() => {
    active.current = true
    const controller = new AbortController()
    requests.add(controller)
    loadingRef.current = true
    const timer = window.setTimeout(() => {
      void prefetchPublicReviews(toiletId, controller.signal).then(page => {
        if (!active.current) return
        setItems(page.items)
        setCursor(page.hasMore ? page.nextCursor : null)
        setError(false)
      }).catch(() => {
        if (active.current) setError(true)
      }).finally(() => {
        requests.delete(controller)
        loadingRef.current = false
        if (active.current) setLoading(false)
      })
    }, 0)
    return () => {
      active.current = false
      loadingRef.current = false
      window.clearTimeout(timer)
      for (const request of requests) request.abort()
    }
  }, [requests, toiletId])

  useEffect(() => {
    if (!fullView) return
    backButton.current?.focus()
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setFullView(false) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [fullView])

  useEffect(() => {
    if (!fullView || !portalTarget) return
    portalTarget.classList.add('is-review-list-open')
    return () => portalTarget.classList.remove('is-review-list-open')
  }, [fullView, portalTarget])

  async function load(next: string | null, refresh = false) {
    if (loadingRef.current) return
    const token = ++epoch.current
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    requests.add(controller)
    loadingRef.current = true
    setLoading(true)
    setError(false)
    try {
      const page = await loadPublicReviews(toiletId, next, controller.signal, refresh)
      if (!active.current || token !== epoch.current) return
      setItems(previous => next ? [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))] : page.items)
      setCursor(page.hasMore ? page.nextCursor : null)
    } catch {
      if (active.current && token === epoch.current) setError(true)
    } finally {
      requests.delete(controller)
      loadingRef.current = false
      if (active.current && token === epoch.current) setLoading(false)
    }
  }

  function openFullView() {
    setPortalTarget(section.current?.closest<HTMLElement>('.place-card, .coordinate-group-card') ?? null)
    setFullView(true)
    trackEvent('screen_view', { screen: 'review_list' })
  }

  function handleSummaryClick(event: MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('button')) return
    openFullView()
  }

  const summaryItems = items.slice(0, SUMMARY_LIMIT)
  const hasReviews = items.length > 0
  const fallbackRating = items.length ? (items.reduce((total, item) => total + Number(reviewAverageLabel(item)), 0) / items.length).toFixed(1) : '—'
  const fullRating = summary?.rating ?? fallbackRating
  const fullReviewCount = summary?.count ?? items.length
  const reviewRows = (rows: StoredReview[], expanded: boolean) => rows.map(item => <PublicReviewRow key={item.id} item={item} expanded={expanded} />)
  const fullPanel = fullView && <section className={`public-review-full-panel${portalTarget ? '' : ' is-inline'}`} aria-label={t('public.full', { name: toiletName })}>
    <header className="public-review-full-header">
      <button ref={backButton} type="button" className="public-review-back" onClick={() => setFullView(false)} aria-label={t('public.back')}><ReviewIcon name="back" size={22} /></button>
      <div className="public-review-full-heading">
        <span className="card-label public-review-full-type">{toiletTypeLabel(toiletType, locale)}</span>
        <div className="review-card-title-row public-review-full-title-row"><h2>{toiletName}</h2></div>
        <div className="public-review-total-rating" aria-label={t('public.summary', { rating: fullRating, count: fullReviewCount })}>
          <span>{t('public.total')}</span><ReviewIcon name="star" size={17} /><strong>{fullRating}</strong><small>/ 5</small><em>{t('public.count', { count: fullReviewCount })}</em>
        </div>
      </div>
    </header>
    <section className="public-review-full-reviews" aria-labelledby="public-review-full-list-title" tabIndex={0}>
      <h3 id="public-review-full-list-title">{t('public.users')} <span>{fullReviewCount}</span></h3>
      <div className="public-review-full-list">
        <div className="public-review-full-rows">
          {reviewRows(items, true)}
          {!loading && !error && items.length === 0 && <p className="public-review-empty">{t('public.empty')}</p>}
          {loading && <PublicReviewLoading />}
          {error && <ReviewLoadError message={t('public.error')} onRetry={() => void load(items.length ? cursor : null, !items.length)} />}
          {cursor && !error && <button className="public-review-more" type="button" disabled={loading} onClick={() => void load(cursor)}>{t(loading ? 'common.loading' : 'public.more')}</button>}
        </div>
      </div>
    </section>
  </section>

  return <section ref={section} className={`public-reviews${hasReviews ? ' is-clickable' : ''}`} aria-label={t('public.users')} onClick={hasReviews ? handleSummaryClick : undefined}>
    <div className="public-review-section-heading"><h2>{t('public.title')} <span>{fullReviewCount}</span></h2>{hasReviews && <button type="button" onClick={openFullView}>{t('public.all')} <span aria-hidden="true">›</span></button>}</div>
    <div className="public-review-summary-panel">
      <div className="public-review-summary-list">
        {reviewRows(summaryItems, false)}
        {!loading && !error && items.length === 0 && <p className="public-review-empty">{t('public.empty')}</p>}
        {loading && items.length === 0 && <PublicReviewLoading />}
        {error && items.length === 0 && <ReviewLoadError message={t('public.error')} onRetry={() => void load(null, true)} />}
      </div>
    </div>
    {fullView && (portalTarget ? createPortal(fullPanel, portalTarget) : fullPanel)}
  </section>
}

function PublicReviewRow({ item, expanded }: { item: StoredReview; expanded: boolean }) {
  const t = useMessages()
  const locale = useLocale()
  const average = reviewAverageLabel(item)
  const comment = item.comment?.trim()
  return <article className={`public-review-row${expanded ? ' is-expanded' : ''}`}>
    <div className="public-review-meta">
      <span className="public-review-avatar"><PhotoImage enabled path={item.authorRemoved || !item.authorPhotoVersion ? null : publicPhotoPath(item.authorPhotoVersion)} fallback={<span role="img" aria-label={t('public.avatar')}>👤</span>} /></span>
      <strong className="public-review-name">{item.authorRemoved ? t('public.anonymous') : item.authorDisplayName}</strong>
      <span className="public-review-rating" aria-label={t('public.average', { rating: average })}><ReviewIcon name="star" size={14} /><strong>{average}</strong></span>
      <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(locale === 'ko' ? 'ko-KR' : locale, { timeZone: 'Asia/Seoul' })}</time>
    </div>
    {comment && <p className="public-review-comment">{comment}</p>}
  </article>
}

function PublicReviewLoading() {
  const t = useMessages()
  return <div className="public-review-loading" role="status"><span /><span />{t('public.loading')}</div>
}

function ReviewLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useMessages()
  return <p className="public-review-error" role="status"><span>{message}</span><button type="button" onClick={onRetry}>{t('common.retry')}</button></p>
}
