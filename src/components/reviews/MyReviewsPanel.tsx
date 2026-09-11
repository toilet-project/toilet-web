import { useMemo, useState } from 'react'
import { historyDateLabel, historyRange, selectHistory } from '../../lib/history'
import { canManageReview, waitLabel, type Review } from '../../lib/review'
import { HistoryFilters, HistoryHeading, HistoryMore } from '../HistoryControls'
import { useHistoryWindow } from '../../lib/useHistoryWindow'

export function MyReviewsPanel<T extends Review>({ reviews, loading, error, message, onRetry, onBack, onEdit, onDetach }: {
  reviews: T[]; loading: boolean; error: string; message: string; onRetry: () => void; onBack?: () => void;
  onEdit: (review: T) => void; onDetach: (review: T) => void;
}) {
  const [range, setRange] = useState(() => historyRange())
  const [expanded, setExpanded] = useState<string | null>(null), [removing, setRemoving] = useState<string | null>(null)
  const matching = useMemo(() => selectHistory(reviews.filter(item => !item.authorRemoved), range), [reviews, range])
  const page = useHistoryWindow(matching.length, JSON.stringify(range))
  return <section className="history-list history-reviews" aria-label="내 리뷰 목록">
    <HistoryHeading title="내 리뷰" description="내가 남긴 이용 경험을 한곳에서 확인해요." onClose={onBack} />
    <HistoryFilters value={range} count={matching.length} onChange={value => { page.reset(); setRange(value); setExpanded(null); setRemoving(null) }} />
    {loading ? <p className="mobile-page-loading" role="status">로그인 상태를 확인하고 있어요.</p> : error ? <div className="my-reports-retry"><p className="my-reports-retry-message" role="alert">{error}</p><button type="button" className="my-reports-retry-button" onClick={onRetry}>다시 확인</button></div> : <>
      {message && <p className="rv-retention-note" role="status">{message}</p>}
      {!matching.length && <div className="history-empty"><strong>이 기간에 남긴 리뷰가 없어요</strong><p>기간을 바꾸거나 지도에서 리뷰를 남겨보세요.</p></div>}
      {matching.slice(0, page.count).map(item => <article className="history-card" key={item.id}>
        <button type="button" className="history-review-summary rv-my-item" aria-expanded={expanded === item.id} onClick={() => { setExpanded(expanded === item.id ? null : item.id); setRemoving(null) }}>
          <span className="rv-my-top"><strong>{item.toiletName}</strong><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span>
          <span className="rv-my-stars">★ {item.satisfaction} / 5 <small>청결 {item.cleanliness} / 5 · 휴지 {item.paper ? '있음' : '없음'}</small></span>
          <span className="rv-my-comment">{item.comment || '별점과 선택 항목으로 남긴 리뷰예요.'}</span>
          <span className="rv-my-meta"><time dateTime={item.createdAt}>{historyDateLabel(item.createdAt)}</time><b>{canManageReview(item) ? '수정 가능' : '7일 경과'}</b></span>
        </button>
        {expanded === item.id && <div className="history-review-detail">
          {removing === item.id ? <div className="history-remove-confirm"><strong>리뷰는 그대로 남아요</strong><p>별점·화장지 유무·대기시간과 <b>작성한 글은 삭제되지 않아요.</b> 작성자만 ‘탈퇴한 사용자’로 표시됩니다.</p><p>내 리뷰에서 사라지고 다시 수정하거나 연결을 복구할 수 없어요. <b>급똥 회원 탈퇴는 아닙니다.</b></p><div className="history-review-actions"><button type="button" onClick={() => setRemoving(null)}>취소</button><button type="button" disabled={!canManageReview(item)} onClick={() => { if (!canManageReview(item)) return; onDetach(item); setExpanded(null); setRemoving(null) }}>정보 지우기</button></div></div> : <>
            <div className="rv-full-review"><dl><div><dt>만족도</dt><dd>★ {item.satisfaction} / 5</dd></div><div><dt>청결도</dt><dd>★ {item.cleanliness} / 5</dd></div><div><dt>화장지</dt><dd>{item.paper ? '있었어요' : '없었어요'}</dd></div><div><dt>대기시간</dt><dd>{waitLabel(item.waitMinutes)}</dd></div></dl><p className="rv-full-comment">{item.comment || '작성한 내용이 없어요.'}</p><p className="rv-retention-note">수정 가능 기한: {historyDateLabel(new Date(Date.parse(item.createdAt) + 7 * 86400000).toISOString())} · 최초 작성 기준</p></div>
            {canManageReview(item) ? <div className="history-review-actions"><button type="button" onClick={() => setRemoving(item.id)}>작성자 정보 지우기</button><button type="button" onClick={() => onEdit(item)}>수정하기</button></div> : <p className="rv-deadline">작성 후 7일이 지나 수정·작성자 정보 지우기가 종료됐어요.</p>}
          </>}
        </div>}
      </article>)}
      <HistoryMore count={page.count} total={matching.length} onMore={page.loadMore} />
    </>}
  </section>
}
