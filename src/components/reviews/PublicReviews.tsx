'use client'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { reviewAverageLabel } from '../../lib/review'
import type { StoredReview } from '../../lib/reviewApi'
import { publicPhotoPath } from '../../lib/profilePhoto'
import { cachedPublicReviews, loadPublicReviews, prefetchPublicReviews, PUBLIC_REVIEW_API_ENABLED } from '../../lib/publicReviewPrefetch'
import { PhotoImage } from '../ProfilePhoto'
import { ReviewIcon } from './ReviewDialog'

const SUMMARY_LIMIT = 3
type PublicReviewSummary = { count: number; rating: string }

export function PublicReviews({ toiletId, toiletName = '화장실', toiletType = '화장실', summary }: { toiletId: number; toiletName?: string; toiletType?: string; summary?: PublicReviewSummary }) {
  if (!PUBLIC_REVIEW_API_ENABLED || toiletId <= 0) return null
  return <PublicReviewList key={toiletId} toiletId={toiletId} toiletName={toiletName} toiletType={toiletType} summary={summary} />
}

function PublicReviewList({ toiletId, toiletName, toiletType, summary }: { toiletId: number; toiletName: string; toiletType: string; summary?: PublicReviewSummary }) {
  const initial = cachedPublicReviews(toiletId)
  const [items, setItems] = useState<StoredReview[]>(initial?.items ?? [])
  const [cursor, setCursor] = useState<string | null>(initial?.hasMore ? initial.nextCursor : null)
  const [loading, setLoading] = useState(!initial), [error, setError] = useState('')
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
        setError('')
      }).catch(() => {
        if (active.current) setError('리뷰를 불러오지 못했어요. 다시 시도해 주세요.')
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
    setError('')
    try {
      const page = await loadPublicReviews(toiletId, next, controller.signal, refresh)
      if (!active.current || token !== epoch.current) return
      setItems(previous => next ? [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))] : page.items)
      setCursor(page.hasMore ? page.nextCursor : null)
    } catch {
      if (active.current && token === epoch.current) setError('리뷰를 불러오지 못했어요. 다시 시도해 주세요.')
    } finally {
      requests.delete(controller)
      loadingRef.current = false
      if (active.current && token === epoch.current) setLoading(false)
    }
  }

  function openFullView() {
    setPortalTarget(section.current?.closest<HTMLElement>('.place-card, .coordinate-group-card') ?? null)
    setFullView(true)
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
  const fullPanel = fullView && <section className={`public-review-full-panel${portalTarget ? '' : ' is-inline'}`} aria-label={`${toiletName} 전체 리뷰`}>
    <header className="public-review-full-header">
      <button ref={backButton} type="button" className="public-review-back" onClick={() => setFullView(false)} aria-label="화장실 상세로 돌아가기"><ReviewIcon name="back" size={22} /></button>
      <div className="public-review-full-heading">
        <span className="public-review-full-type">{toiletType}</span>
        <h2>{toiletName}</h2>
        <div className="public-review-total-rating" aria-label={`총 평점 ${fullRating}점, 리뷰 ${fullReviewCount}개`}>
          <span>총 평점</span><ReviewIcon name="star" size={17} /><strong>{fullRating}</strong><small>/ 5</small><em>리뷰 {fullReviewCount}개</em>
        </div>
      </div>
    </header>
    <section className="public-review-full-reviews" aria-labelledby="public-review-full-list-title">
      <h3 id="public-review-full-list-title">이용자 리뷰 <span>{fullReviewCount}</span></h3>
      <div className="public-review-full-list" tabIndex={0}>
        {reviewRows(items, true)}
        {!loading && !error && items.length === 0 && <p className="public-review-empty">아직 작성된 리뷰가 없어요.</p>}
        {loading && <PublicReviewLoading />}
        {error && <ReviewLoadError message={error} onRetry={() => void load(items.length ? cursor : null, !items.length)} />}
        {cursor && !error && <button className="public-review-more" type="button" disabled={loading} onClick={() => void load(cursor)}>{loading ? '불러오는 중…' : '리뷰 더 불러오기'}</button>}
      </div>
    </section>
  </section>

  return <section ref={section} className={`public-reviews${hasReviews ? ' is-clickable' : ''}`} aria-label="이용자 리뷰" onClick={hasReviews ? handleSummaryClick : undefined}>
    <div className="public-review-section-heading"><h2>리뷰</h2>{hasReviews && <button type="button" onClick={openFullView}>전체보기 <span aria-hidden="true">›</span></button>}</div>
    <div className="public-review-summary-list">
      {reviewRows(summaryItems, false)}
      {!loading && !error && items.length === 0 && <p className="public-review-empty">아직 작성된 리뷰가 없어요.</p>}
      {loading && items.length === 0 && <PublicReviewLoading />}
      {error && items.length === 0 && <ReviewLoadError message={error} onRetry={() => void load(null, true)} />}
    </div>
    {fullView && (portalTarget ? createPortal(fullPanel, portalTarget) : fullPanel)}
  </section>
}

function PublicReviewRow({ item, expanded }: { item: StoredReview; expanded: boolean }) {
  const average = reviewAverageLabel(item)
  const comment = item.comment?.trim()
  return <article className={`public-review-row${expanded ? ' is-expanded' : ''}`}>
    <div className="public-review-meta">
      <span className="public-review-avatar"><PhotoImage enabled path={item.authorRemoved || !item.authorPhotoVersion ? null : publicPhotoPath(item.authorPhotoVersion)} fallback={<span role="img" aria-label="기본 프로필 이미지">👤</span>} /></span>
      <strong className="public-review-name">{item.authorDisplayName}</strong>
      <span className="public-review-rating" aria-label={`평균 평점 ${average}점`}><ReviewIcon name="star" size={14} /><strong>{average}</strong></span>
      <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</time>
    </div>
    {comment && <p className="public-review-comment">{comment}</p>}
  </article>
}

function PublicReviewLoading() {
  return <div className="public-review-loading" role="status"><span /><span />리뷰를 불러오는 중…</div>
}

function ReviewLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <p className="public-review-error" role="status"><span>{message}</span><button type="button" onClick={onRetry}>다시 불러오기</button></p>
}
