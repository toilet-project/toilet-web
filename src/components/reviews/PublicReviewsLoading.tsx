'use client'
import { useMessages } from '../../i18n/context'

export function PublicReviewsLoading() {
  const t = useMessages()
  if (process.env.NEXT_PUBLIC_PUBLIC_REVIEW_API_ENABLED !== 'true') return null
  return <section className="public-reviews is-loading" aria-label={t('public.loading')} aria-busy="true">
    <div className="public-review-section-heading"><h2>{t('public.title')} <span>—</span></h2></div>
    <div className="public-review-summary-panel">
      <div className="public-review-summary-list"><PublicReviewLoading /></div>
    </div>
  </section>
}

export function PublicReviewLoading() {
  const t = useMessages()
  return <div className="public-review-loading" role="status"><span /><span />{t('public.loading')}</div>
}

export function PublicReviewsFallback({ onRetry }: { onRetry?: () => void }) {
  const t = useMessages()
  return onRetry ? <p className="public-review-error" role="alert"><span>{t('public.error')}</span><button type="button" onClick={onRetry}>{t('common.retry')}</button></p> : <PublicReviewsLoading />
}
