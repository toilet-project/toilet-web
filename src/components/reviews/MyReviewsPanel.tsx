import { useLocale, useMessages } from '../../i18n/context'
import { reviewErrorMessage } from '../../i18n/reviewErrors'
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
  const locale = useLocale(), t = useMessages()
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
    catch (error) { setRemovalError(error instanceof ReviewApiError ? reviewErrorMessage(error, locale) : t('review.detachFailed')) }
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
  return <section className="history-list history-reviews" aria-label={t('review.list')}>
    <HistoryHeading title={t('nav.myReviews')} onClose={onBack} />
    <HistoryFilters embedded={Boolean(onBack)} value={range} count={matching.length} countLabel={remote ? t('history.loaded', { count: matching.length }) : undefined} onChange={value => { if (removalLock.current) return; page.reset(); setRange(value); remote?.onRangeChange(value); setExpanded(null); setRemoving(null); setRemovalError('') }} />
    {loading ? <p className="mobile-page-loading" role="status">{t(remote ? 'review.loading' : 'auth.checking')}</p> : error ? <div className="my-reports-retry"><p className="my-reports-retry-message" role="alert">{error}</p><button type="button" className="my-reports-retry-button" onClick={onRetry}>{t('common.retry')}</button></div> : <>
      {message && <p className="rv-retention-note" role="status">{message}</p>}
      {!matching.length && <div className="history-empty"><strong>{t('review.empty')}</strong><p>{t('review.emptyHint')}</p></div>}
      {visible.map(item => <article className="history-card" key={item.id}>
        <button ref={item.id === focusedReviewId ? focusedButton : undefined} type="button" className="history-review-summary rv-my-item" aria-expanded={expanded === item.id} disabled={removingBusy} onClick={() => { setExpanded(expanded === item.id ? null : item.id); setRemoving(null); setRemovalError('') }}>
          <span className="rv-my-top"><strong>{item.toiletName}</strong><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span>
          <span className="rv-my-stars"><span title={t('review.average')}>★ {reviewAverageLabel(item)} / 5</span> <small>{t(item.paper ? 'review.paperShortYes' : 'review.paperShortNo')}</small></span>
          <span className="rv-my-comment">{item.comment || t('review.noCommentSummary')}</span>
          <span className="rv-my-meta"><time dateTime={item.createdAt}>{historyDateLabel(item.createdAt, locale)}</time><b>{t(canManageReview(item) ? 'review.editable' : 'review.expiredShort')}</b></span>
        </button>
        {expanded === item.id && <div className="history-review-detail">
          {removing === item.id ? <div className="history-remove-confirm"><strong>{t('review.detachTitle')}</strong><p><strong>{t('review.detachDetails')}</strong></p><p>{t('review.detachWarning')}</p>{removalError && <p role="alert">{removalError}</p>}<div className="history-review-actions"><button type="button" disabled={removingBusy} onClick={() => setRemoving(null)}>{t('common.cancel')}</button><button type="button" disabled={removingBusy || !canManageReview(item)} onClick={() => { void detach(item) }}>{t(removingBusy ? 'common.processing' : 'review.detachConfirm')}</button></div></div> : <>
            <div className="rv-full-review"><dl><div><dt>{t('review.satisfaction')}</dt><dd>★ {item.satisfaction} / 5</dd></div><div><dt>{t('review.cleanliness')}</dt><dd>★ {item.cleanliness} / 5</dd></div><div><dt>{t('review.paper')}</dt><dd>{t(item.paper ? 'review.paperYes' : 'review.paperNo')}</dd></div><div><dt>{t('review.wait')}</dt><dd>{waitLabel(item.waitMinutes, locale)}</dd></div></dl><p className="rv-full-comment">{item.comment || t('review.noComment')}</p><p className="rv-retention-note">{t('review.deadline', { date: historyDateLabel(new Date(Date.parse(item.createdAt) + 7 * 86400000).toISOString(), locale) })}</p></div>
            {canManageReview(item) ? <div className="history-review-actions"><button type="button" className="history-review-edit" onClick={() => onEdit(item)}>{t('common.edit')}</button><button type="button" className="history-review-remove" aria-label={t('review.detach')} title={t('review.detach')} onClick={() => setRemoving(item.id)}><ReviewIcon name="trash" size={18} /></button></div> : <p className="rv-deadline">{t('review.expired')}</p>}
          </>}
        </div>}
      </article>)}
      {remote ? remote.loadingMore ? <p role="status">{t('review.loadingMore')}</p> : remote.moreError ? <div className="my-reports-retry"><p role="alert">{remote.moreError}</p><button className="my-reports-retry-button" onClick={remote.onMore}>{t('common.retry')}</button></div> : <HistoryMore count={matching.length} total={matching.length + (remote.hasMore ? 1 : 0)} onMore={remote.onMore} label={t('review.more')} /> : <HistoryMore count={page.count} total={matching.length} onMore={page.loadMore} />}
    </>}
  </section>
}
