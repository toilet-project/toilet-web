'use client'
import { useEffect, useRef, useState } from 'react'
import { createApiUrl } from '../../config/api'
import { decodeReview, type StoredReview } from '../../lib/reviewApi'
import { PROFILE_PHOTO_ENABLED, reviewPhotoPath } from '../../lib/profilePhoto'
import { PhotoImage } from '../ProfilePhoto'

export function PublicReviews({ toiletId }: { toiletId: number }) {
  if (!PROFILE_PHOTO_ENABLED || process.env.NEXT_PUBLIC_REVIEW_API_ENABLED !== 'true' || toiletId <= 0) return null
  return <PublicReviewList key={toiletId} toiletId={toiletId} />
}
function PublicReviewList({ toiletId }: { toiletId: number }) {
  const [open, setOpen] = useState(false), [items, setItems] = useState<StoredReview[]>([])
  const [cursor, setCursor] = useState<string | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const active = useRef(false), epoch = useRef(0), abort = useRef<AbortController | null>(null)
  const [requests] = useState(() => new Set<AbortController>())
  useEffect(() => { active.current = true; return () => { active.current = false; for (const request of requests) request.abort() } }, [requests])
  async function load(next: string | null) {
    const token = ++epoch.current
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller
    requests.add(controller)
    setLoading(true); setError('')
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      const query = new URLSearchParams({ size: '10' }); if (next) query.set('cursor', next)
      const response = await fetch(createApiUrl(`/api/v1/toilets/${toiletId}/reviews?${query}`), { credentials: 'omit', cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error()
      const page = await response.json() as { items: unknown[]; hasMore: boolean; nextCursor: string | null }
      if (!Array.isArray(page.items) || page.items.length > 10 || typeof page.hasMore !== 'boolean'
        || !(page.nextCursor === null || typeof page.nextCursor === 'string' && page.nextCursor.length <= 100)
        || (page.hasMore ? !page.nextCursor || page.nextCursor === next || !page.items.length : page.nextCursor !== null)) throw new Error()
      const incoming = page.items.map(decodeReview)
      if (incoming.some(item => item.toiletId !== toiletId) || new Set(incoming.map(item => item.id)).size !== incoming.length) throw new Error()
      if (!active.current || token !== epoch.current) return
      setItems(previous => next ? [...previous, ...incoming.filter(item => !previous.some(old => old.id === item.id))] : incoming)
      setCursor(page.hasMore ? page.nextCursor : null)
    } catch { if (active.current && token === epoch.current) setError('리뷰를 불러오지 못했어요. 다시 시도해 주세요.') }
    finally { requests.delete(controller); clearTimeout(timeout); if (active.current && token === epoch.current) setLoading(false) }
  }
  function toggle() {
    if (open) { epoch.current++; abort.current?.abort(); setOpen(false); setItems([]); setCursor(null); setError(''); setLoading(false) }
    else { setOpen(true); void load(null) }
  }
  return <section className="public-reviews" aria-label="이용자 리뷰">
    <button type="button" aria-expanded={open} onClick={toggle}>{open ? '이용자 리뷰 접기' : '이용자 리뷰 보기'}</button>
    {open && <div>
      {items.map(item => <article key={item.id}>
        <div className="public-review-author"><span className="public-review-avatar"><PhotoImage
          path={item.authorRemoved ? null : reviewPhotoPath(toiletId, item.id)} fallback={<span role="img" aria-label="기본 프로필 이미지">👤</span>} /></span><strong>{item.authorDisplayName}</strong></div>
        <p className="public-review-score">만족도 {item.satisfaction}/5 · 청결도 {item.cleanliness}/5</p>
        {item.comment && <p>{item.comment}</p>}
        <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}</time>
      </article>)}
      {!loading && !error && items.length === 0 && <p>아직 작성된 리뷰가 없어요.</p>}
      {loading && <p role="status">리뷰를 불러오는 중…</p>}
      {error && <p role="status">{error}<button type="button" onClick={() => void load(items.length ? cursor : null)}>다시 불러오기</button></p>}
      {cursor && !error && <button type="button" disabled={loading} onClick={() => void load(cursor)}>리뷰 더 보기</button>}
    </div>}
  </section>
}
