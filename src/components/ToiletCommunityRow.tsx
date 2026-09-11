'use client'
import { ReviewIcon } from './reviews/ReviewDialog'
import type { PreviewReviewSummary } from './reviews/useIntegratedReviewPreview'

export function ToiletCommunityRow({ onReport, pendingReport = false, onReview, pendingReview = false, previewSummary }: { onReport?: () => void; pendingReport?: boolean; onReview?: () => void; pendingReview?: boolean; previewSummary?: PreviewReviewSummary }) {
  const hasReview = Boolean(onReview || pendingReview)
  return <div className={`toilet-community-row${onReport || pendingReport || hasReview ? '' : ' is-readonly'}`} data-review-preview={hasReview || undefined}>
    <div className="toilet-community-metric" aria-label={previewSummary ? `체험 리뷰 평점: ${previewSummary.rating}` : '평점: 준비 중'} title={previewSummary ? '프리뷰 체험 리뷰 기준 · 실제 통계 아님' : '평점 기능 준비 중'}>
      <span><ReviewIcon name="star" className="metric-star" size={16} />평점</span><strong>{previewSummary?.rating ?? '—'} <small>/ {hasReview ? '5' : '5.0'}</small></strong>
    </div>
    <div className="toilet-community-metric" aria-label={previewSummary ? `체험 혼잡도: ${previewSummary.congestion}` : '혼잡도: 준비 중'} title="혼잡도 기능 준비 중">
      <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /><circle cx="9" cy="7" r="4" /></svg>혼잡도</span><strong className="metric-pending">{previewSummary?.congestion ?? '준비 중'}</strong>
    </div>
    <div className="toilet-community-metric" aria-label={previewSummary ? `체험 휴지 있음 비율: ${previewSummary.paper}%` : '휴지 있음 비율: 준비 중'} title="휴지 있음 비율 기능 준비 중">
      <span><svg className="metric-paper" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><ellipse cx="6" cy="9" rx="3" ry="6" /><path d="M6 3h10c2.8 0 5 2.7 5 6v12H9V9M6 15h3M6 8v2M12 16h1m3 0h1" /></svg>휴지 있음</span><strong>{previewSummary?.paper ?? '—'}<small>%</small></strong>
    </div>
    {hasReview ? <button disabled={pendingReview} type="button" className="report-entry-button report-icon-button" onClick={onReview} aria-label="리뷰" title="로그인 후 150m 이내에서 리뷰 쓰기"><ReviewIcon name="review" size={16} /><span>리뷰</span></button> : (onReport || pendingReport) && <button disabled={pendingReport} type="button" className="report-entry-button report-icon-button" onClick={onReport} aria-label="정보 제공하기" title="정보 제공하기">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4H5a2 2 0 0 0-2 2v15l4-3h11a2 2 0 0 0 2-2v-5" /><path d="m13 12-4 1 1-4 7-7 3 3-7 7Z" /></svg>
      <span>제보</span>
    </button>}
  </div>
}

export function ToiletReportEntry({ onClick, disabled = false }: { onClick?: () => void; disabled?: boolean }) {
  return <button type="button" className="review-card-report" onClick={onClick} disabled={disabled} aria-label="정보 제공하기" title="시설 정보 제보"><ReviewIcon name="siren" size={18} /><span>제보</span></button>
}
