import { useEffect, useMemo, useRef, useState } from 'react'
import { historyDateLabel, historyRange, selectHistory, type HistoryRange } from '../../lib/history'
import { ReviewApiError } from '../../lib/reviewApi'
import { canManageReview, reviewAverageLabel, waitLabel, type Review } from '../../lib/review'
import { HistoryFilters, HistoryHeading, HistoryMore } from '../HistoryControls'
import { historyScroller, useHistoryWindow } from '../../lib/useHistoryWindow'
import { ReviewIcon } from './ReviewDialog'

export function MyReviewsPanel<T extends Review>({ reviews, loading, error, message, focusedReviewId, onRetry, onBack, onEdit, onDetach, remote }: {
  reviews: T[]; loading: boolean; error: string; message: string; onRetry: () => void; onBack?: () => void;
  onEdit: (review: T) => void; onDetach: (review: T) => void | Promise<void>;
  focusedReviewId?: string;
  remote?: { range: HistoryRange; onRangeChange: (value: HistoryRange) => void; hasMore: boolean; loadingMore: boolean; moreError: string; onMore: () => void };
}) {
  const [localRange, setRange] = useState(() => historyRange())
  const range = remote?.range ?? localRange
  const [removingBusy, setRemovingBusy] = useState(false), [removalError, setRemovalError] = useState('')
  const removalLock = useRef(false)
  const [expanded, setExpanded] = useState<string | null>(focusedReviewId ?? null), [removing, setRemoving] = useState<string | null>(null)
  const matching = useMemo(() => selectHistory(reviews.filter(item => !item.authorRemoved), range), [reviews, range])
  const page = useHistoryWindow(matching.length, JSON.stringify(range), matching.findIndex(item => item.id === focusedReviewId))
  const visible = remote ? matching : matching.slice(0, page.count)
  const detach = async (item: T) => {
    if (removalLock.current || !canManageReview(item)) return
    removalLock.current = true; setRemovingBusy(true); setRemovalError('')
    try { await onDetach(item); setExpanded(null); setRemoving(null) }
    catch (error) { setRemovalError(error instanceof ReviewApiError ? error.message : '작성자 정보를 지우지 못했어요. 다시 확인해 주세요.') }
    finally { removalLock.current = false; setRemovingBusy(false) }
  }
  const focusedButton = useRef<HTMLButtonElement>(null)
  const focused = useRef(false)
  useEffect(() => {
    const button = focusedButton.current
    if (loading || error || !button || focused.current) return
    focused.current = true
    button.focus({ preventScroll: true })
    const scroller = historyScroller(button)
    if (scroller) {
      const card = button.getBoundingClientRect(), viewport = scroller.getBoundingClientRect()
      if (card.top < viewport.top || card.bottom > viewport.bottom) scroller.scrollTop += card.top - viewport.top - 12
    }
  }, [loading, error, focusedReviewId])
  return <section className="history-list history-reviews" aria-label="내 리뷰 목록">
    <HistoryHeading title="내 리뷰" onClose={onBack} />
    <HistoryFilters collapsible={Boolean(onBack)} value={range} count={matching.length} countLabel={remote ? `${matching.length}개 불러옴 · 최신순` : undefined} onChange={value => { if (removalLock.current) return; page.reset(); setRange(value); remote?.onRangeChange(value); setExpanded(null); setRemoving(null); setRemovalError('') }} />
    {loading ? <p className="mobile-page-loading" role="status">{remote ? '리뷰를 불러오고 있어요.' : '로그인 상태를 확인하고 있어요.'}</p> : error ? <div className="my-reports-retry"><p className="my-reports-retry-message" role="alert">{error}</p><button type="button" className="my-reports-retry-button" onClick={onRetry}>다시 확인</button></div> : <>
      {message && <p className="rv-retention-note" role="status">{message}</p>}
      {!matching.length && <div className="history-empty"><strong>이 기간에 남긴 리뷰가 없어요</strong><p>기간을 바꾸거나 지도에서 리뷰를 남겨보세요.</p></div>}
      {visible.map(item => <article className="history-card" key={item.id}>
        <button ref={item.id === focusedReviewId ? focusedButton : undefined} type="button" className="history-review-summary rv-my-item" aria-expanded={expanded === item.id} disabled={removingBusy} onClick={() => { setExpanded(expanded === item.id ? null : item.id); setRemoving(null); setRemovalError('') }}>
          <span className="rv-my-top"><strong>{item.toiletName}</strong><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span>
          <span className="rv-my-stars"><span title="만족도·청결도 평균">★ {reviewAverageLabel(item)} / 5</span> <small>휴지 {item.paper ? '있음' : '없음'}</small></span>
          <span className="rv-my-comment">{item.comment || '별점과 선택 항목으로 남긴 리뷰예요.'}</span>
          <span className="rv-my-meta"><time dateTime={item.createdAt}>{historyDateLabel(item.createdAt)}</time><b>{canManageReview(item) ? '수정 가능' : '7일 경과'}</b></span>
        </button>
        {expanded === item.id && <div className="history-review-detail">
          {removing === item.id ? <div className="history-remove-confirm"><strong>리뷰는 그대로 남아요</strong><p>별점·화장지 유무·대기시간과 <b>작성한 글은 삭제되지 않아요.</b> 이 리뷰의 작성자 이름만 ‘익명’으로 바뀝니다.</p><p>내 리뷰에서 사라지고 다시 수정하거나 연결을 복구할 수 없어요. <b>급똥 회원 탈퇴는 아닙니다.</b></p>{removalError && <p role="alert">{removalError}</p>}<div className="history-review-actions"><button type="button" disabled={removingBusy} onClick={() => setRemoving(null)}>취소</button><button type="button" disabled={removingBusy || !canManageReview(item)} onClick={() => { void detach(item) }}>{removingBusy ? '처리 중…' : '정보 지우기'}</button></div></div> : <>
            <div className="rv-full-review"><dl><div><dt>만족도</dt><dd>★ {item.satisfaction} / 5</dd></div><div><dt>청결도</dt><dd>★ {item.cleanliness} / 5</dd></div><div><dt>화장지</dt><dd>{item.paper ? '있었어요' : '없었어요'}</dd></div><div><dt>대기시간</dt><dd>{waitLabel(item.waitMinutes)}</dd></div></dl><p className="rv-full-comment">{item.comment || '작성한 내용이 없어요.'}</p><p className="rv-retention-note">수정 가능 기한: {historyDateLabel(new Date(Date.parse(item.createdAt) + 7 * 86400000).toISOString())} · 최초 작성 기준</p></div>
            {canManageReview(item) ? <div className="history-review-actions"><button type="button" className="history-review-edit" onClick={() => onEdit(item)}>수정하기</button><button type="button" className="history-review-remove" aria-label="작성자 정보 지우기" title="작성자 정보 지우기" onClick={() => setRemoving(item.id)}><ReviewIcon name="trash" size={18} /></button></div> : <p className="rv-deadline">작성 후 7일이 지나 수정·작성자 정보 지우기가 종료됐어요.</p>}
          </>}
        </div>}
      </article>)}
      {remote ? remote.loadingMore ? <p role="status">리뷰를 더 불러오고 있어요.</p> : remote.moreError ? <div className="my-reports-retry"><p role="alert">{remote.moreError}</p><button className="my-reports-retry-button" onClick={remote.onMore}>다시 불러오기</button></div> : <HistoryMore count={matching.length} total={matching.length + (remote.hasMore ? 1 : 0)} onMore={remote.onMore} label="리뷰 더 보기" /> : <HistoryMore count={page.count} total={matching.length} onMore={page.loadMore} />}
    </>}
  </section>
}
