'use client'
import { useMessages } from '../i18n/context'
import { useId, useRef } from 'react'
import { ReviewIcon } from './reviews/ReviewDialog'
import { ReviewEntryHint } from './reviews/ReviewEntryHint'
import type { PreviewReviewSummary, ReviewEntryState } from './reviews/useIntegratedReviewPreview'

export function ToiletCommunityRow({ onReport, pendingReport = false, onReview, pendingReview = false, previewSummary, reviewEntry }: { onReport?: () => void; pendingReport?: boolean; onReview?: () => void; pendingReview?: boolean; previewSummary?: PreviewReviewSummary; reviewEntry?: ReviewEntryState }) {
  const t = useMessages()
  const crowding = previewSummary?.congestion
  const crowdingLabel = crowding === '원활' ? t('metric.clear') : crowding === '대기' ? t('metric.wait') : crowding === '혼잡' ? t('metric.busy') : t('metric.unknown')
  const hasReview = Boolean(onReview || pendingReview)
  const checking = reviewEntry?.status === 'checking', retry = reviewEntry?.status === 'retry'
  const reviewButton = useRef<HTMLButtonElement>(null), hintId = useId()
  const real = previewSummary?.source === 'api'
  return <div className={`toilet-community-row${onReport || pendingReport || hasReview ? '' : ' is-readonly'}`} data-review-preview={hasReview || undefined}>
    <div className="toilet-community-metric" aria-label={previewSummary ? `${t('metric.rating')}: ${previewSummary.rating}` : t('metric.pending')} title={previewSummary ? real ? t('metric.reviews', { count: previewSummary.count }) : t('metric.preview') : t('metric.pending')}>
      <span><ReviewIcon name="star" className="metric-star" size={16} />{t('metric.rating')}</span><strong>{previewSummary?.rating ?? '—'} <small>/ {hasReview ? '5' : '5.0'}</small></strong>
    </div>
    <div className="toilet-community-metric" aria-label={previewSummary ? `${t('metric.crowding')}: ${crowdingLabel}` : t('metric.pending')} title={t(real ? 'metric.waitHint' : 'metric.pending')}>
      <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /><circle cx="9" cy="7" r="4" /></svg>{t('metric.crowding')}</span><strong className="metric-pending">{previewSummary ? crowdingLabel : t('metric.pending')}</strong>
    </div>
    <div className="toilet-community-metric" aria-label={previewSummary ? `${t('metric.paper')}: ${previewSummary.paper === null ? t('metric.unknown') : `${previewSummary.paper}%`}` : t('metric.pending')} title={t(real ? 'metric.paperHint' : 'metric.pending')}>
      <span><svg className="metric-paper" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><ellipse cx="6" cy="9" rx="3" ry="6" /><path d="M6 3h10c2.8 0 5 2.7 5 6v12H9V9M6 15h3M6 8v2M12 16h1m3 0h1" /></svg>{t('metric.paper')}</span><strong>{previewSummary?.paper ?? '—'}<small>%</small></strong>
    </div>
    {hasReview ? <><button ref={reviewButton} disabled={pendingReview || checking} type="button" className={`report-entry-button report-icon-button review-entry${checking ? ' is-checking' : ''}`} onClick={onReview} aria-label={t(checking ? 'metric.checking' : retry ? 'metric.refresh' : 'metric.review')} aria-busy={checking || undefined} aria-describedby={reviewEntry && !checking ? hintId : undefined} title={reviewEntry?.message || t('metric.writeHint')}><ReviewIcon name={checking || retry ? 'refresh' : 'review'} size={16} /><span>{t(checking ? 'map.checking' : retry ? 'metric.retry' : 'metric.review')}</span><span className="review-entry-status" role="status">{checking ? reviewEntry.message : ''}</span></button>{reviewEntry && !checking && <ReviewEntryHint key={reviewEntry.message} anchor={reviewButton} message={reviewEntry.message} id={hintId} dismissAfterMs={retry ? null : undefined} />}</> : (onReport || pendingReport) && <button disabled={pendingReport} type="button" className="report-entry-button report-icon-button" onClick={onReport} aria-label={t('metric.reportHint')} title={t('metric.reportHint')}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4H5a2 2 0 0 0-2 2v15l4-3h11a2 2 0 0 0 2-2v-5" /><path d="m13 12-4 1 1-4 7-7 3 3-7 7Z" /></svg>
      <span>{t('metric.report')}</span>
    </button>}
  </div>
}

export function ToiletReportEntry({ onClick, disabled = false, iconOnly = false }: { onClick?: () => void; disabled?: boolean; iconOnly?: boolean }) {
  const t = useMessages()
  return <button type="button" className={`review-card-report${iconOnly ? ' is-icon-only' : ''}`} onClick={onClick} disabled={disabled} aria-label={t('metric.reportHint')} title={t('metric.reportHint')}><ReviewIcon name="siren" size={iconOnly ? 20 : 18} />{!iconOnly && <span>{t('metric.report')}</span>}</button>
}
