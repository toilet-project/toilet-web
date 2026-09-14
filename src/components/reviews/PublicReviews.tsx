'use client'
import { useEffect, useRef, useState } from 'react'
import type { StoredReview } from '../../lib/reviewApi'
import { PROFILE_PHOTO_ENABLED, publicPhotoPath } from '../../lib/profilePhoto'
import { cachedPublicReviews, loadPublicReviews, prefetchPublicReviews } from '../../lib/publicReviewPrefetch'
import { PhotoImage } from '../ProfilePhoto'

export function PublicReviews({ toiletId }: { toiletId: number }) {
  if (!PROFILE_PHOTO_ENABLED || process.env.NEXT_PUBLIC_REVIEW_API_ENABLED !== 'true' || toiletId <= 0) return null
  return <PublicReviewList key={toiletId} toiletId={toiletId} />
}
function PublicReviewList({ toiletId }: { toiletId: number }) {
  const initial = cachedPublicReviews(toiletId)
  const [open, setOpen] = useState(false), [items, setItems] = useState<StoredReview[]>(initial?.items ?? [])
  const [cursor, setCursor] = useState<string | null>(initial?.hasMore ? initial.nextCursor : null)
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  const active = useRef(false), epoch = useRef(0), abort = useRef<AbortController | null>(null)
  const loadingRef = useRef(false)
  const [requests] = useState(() => new Set<AbortController>())
  useEffect(() => {
    active.current = true
    const controller = new AbortController()
    requests.add(controller)
    // Defer one task so React Strict Mode can discard its probe mount without aborting the shared request.
    const timer = window.setTimeout(() => {
      void prefetchPublicReviews(toiletId, controller.signal).catch(() => undefined).finally(() => requests.delete(controller))
    }, 0)
    return () => { active.current = false; loadingRef.current = false; window.clearTimeout(timer); for (const request of requests) request.abort() }
  }, [requests, toiletId])
  async function load(next: string | null, refresh = false) {
    if (loadingRef.current) return
    const token = ++epoch.current
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller
    requests.add(controller)
    loadingRef.current = true
    setLoading(true); setError('')
    try {
      const page = await loadPublicReviews(toiletId, next, controller.signal, refresh)
      if (!active.current || token !== epoch.current) return
      setItems(previous => next ? [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))] : page.items)
      setCursor(page.hasMore ? page.nextCursor : null)
    } catch { if (active.current && token === epoch.current) setError('리뷰를 불러오지 못했어요. 다시 시도해 주세요.') }
    finally { requests.delete(controller); loadingRef.current = false; if (active.current && token === epoch.current) setLoading(false) }
  }
  function toggle() {
    if (open) setOpen(false)
    else {
      setOpen(true)
      const cached = cachedPublicReviews(toiletId)
      if (cached) { setItems(cached.items); setCursor(cached.hasMore ? cached.nextCursor : null); setError('') }
      else if (!loadingRef.current) void load(null, Boolean(error))
    }
  }
  return <section className="public-reviews" aria-label="이용자 리뷰">
    <button type="button" aria-expanded={open} onClick={toggle}>{open ? '이용자 리뷰 접기' : '이용자 리뷰 보기'}</button>
    {open && <div>
      {items.map(item => <article key={item.id}>
        <div className="public-review-author"><span className="public-review-avatar"><PhotoImage
          path={item.authorRemoved || !item.authorPhotoVersion ? null : publicPhotoPath(item.authorPhotoVersion)} fallback={<span role="img" aria-label="기본 프로필 이미지">👤</span>} /></span><strong>{item.authorDisplayName}</strong></div>
        <p className="public-review-score">만족도 {item.satisfaction}/5 · 청결도 {item.cleanliness}/5</p>
        {item.comment && <p>{item.comment}</p>}
        <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</time>
      </article>)}
      {!loading && !error && items.length === 0 && <p>아직 작성된 리뷰가 없어요.</p>}
      {loading && <p role="status">리뷰를 불러오는 중…</p>}
      {error && <p role="status">{error}<button type="button" onClick={() => void load(items.length ? cursor : null, !items.length)}>다시 불러오기</button></p>}
      {cursor && !error && <button type="button" disabled={loading} onClick={() => void load(cursor)}>리뷰 더 보기</button>}
    </div>}
  </section>
}
