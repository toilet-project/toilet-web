import { useEffect, useRef, useState } from 'react'
import { type ToiletReport, type ToiletReportStatus } from '../api/reports'
import { getDisplayAddress } from '../lib/address'
import { reportReadErrorMessage } from '../lib/report-error'
import { useDialogFocus } from '../lib/useDialogFocus'
import { historyDateLabel, historyRange, type HistoryRange } from '../lib/history'
import { HistoryFilters, HistoryHeading, HistoryMore } from './HistoryControls'
import { historyScroller } from '../lib/useHistoryWindow'
import { useReportHistory } from '../lib/useReportHistory'

import { useLocale, useMessages } from '../i18n/context'
import type { MessageKey } from '../i18n/messages'
import { quickReportMessage } from '../i18n/quickReportMessages'

type Filter = 'ALL' | ToiletReportStatus

const filters: { value: Filter; label: MessageKey }[] = [
  { value: 'ALL', label: 'common.all' },
  { value: 'PENDING', label: 'report.pending' },
  { value: 'APPROVED', label: 'report.approved' },
  { value: 'REJECTED', label: 'report.rejected' },
  { value: 'CANCELLED', label: 'report.cancelled' },
]

const statusLabel: Record<ToiletReportStatus, MessageKey> = {
  PENDING: 'report.pendingReview', APPROVED: 'report.approved', REJECTED: 'report.rejected', CANCELLED: 'report.cancelled',
}

const reportTypeLabel = (type: ToiletReport['reportType']) => type === 'COORDINATE_CORRECTION' ? 'report.location' : 'report.hours'

export function MyReportsPanel({ onClose, onSessionExpired, initialExpandedId = null, embedded = false, onBack }: { onClose: () => void; onSessionExpired: () => void; initialExpandedId?: number | null; embedded?: boolean; onBack?: () => void }) {
  const locale = useLocale(), t = useMessages()
  const formatDate = (value?: string | null) => value ? historyDateLabel(value, locale) : '-'
  const dialog = useDialogFocus(!embedded, onClose)
  const [filter, setFilter] = useState<Filter>('ALL')
  const [range, setRange] = useState<HistoryRange>(() => historyRange(initialExpandedId ? 'all' : '7'))
  const [focusInitial, setFocusInitial] = useState(Boolean(initialExpandedId))
  const [expandedId, setExpandedId] = useState<number | null>(initialExpandedId)
  const focusedReportRef = useRef<HTMLElement | null>(null)
  const titleId = embedded ? 'mobile-my-reports-title' : 'my-reports-title'

  const history = useReportHistory(range, filter, focusInitial ? initialExpandedId : null, onSessionExpired)
  const isLoading = history.loading
  const firstError = history.error
  const error = history.error || history.moreError || history.focusError
  const retryReports = () => {
    if (isLoading) return
    void history.retry()
  }
  const visibleReports = history.focused ? [history.focused, ...history.items.filter(report => report.id !== history.focused?.id)] : history.items
  const reset = () => { setExpandedId(null); setFocusInitial(false) }

  useEffect(() => {
    if (!focusInitial || !initialExpandedId || isLoading || !focusedReportRef.current) return
    const scroll = historyScroller(focusedReportRef.current)
    const heading = embedded ? focusedReportRef.current.closest('.my-reports-panel')?.querySelector<HTMLElement>('.history-heading') : null
    const headingHeight = heading && getComputedStyle(heading).position === 'sticky' ? heading.getBoundingClientRect().height : 0
    if (scroll) scroll.scrollTop += focusedReportRef.current.getBoundingClientRect().top - scroll.getBoundingClientRect().top - headingHeight - 16
  }, [initialExpandedId, isLoading, focusInitial, embedded, history.focused])

  return <div className={`history-list ${embedded ? 'my-reports-embedded' : 'my-reports-backdrop'}`} onMouseDown={(event) => { if (!embedded && event.target === event.currentTarget) onClose() }}>
    <section ref={dialog} tabIndex={embedded ? undefined : -1} className="my-reports-panel" role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : true} aria-labelledby={titleId}>
      <HistoryHeading id={titleId} title={t('nav.myReports')} onClose={embedded ? onBack : onClose} />
      <HistoryFilters embedded={embedded} value={range} onChange={value => { reset(); setRange(value) }} count={history.total}>
        <nav className="my-reports-filters" aria-label={t('report.statusFilter')}>
          {filters.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} className={filter === item.value ? 'is-active' : ''} onClick={() => { reset(); setFilter(item.value) }}>
            {t(item.label)}<span>{history.counts[item.value]}</span>
          </button>)}
        </nav>
      </HistoryFilters>
      <div className="my-reports-content" aria-busy={isLoading}>
        {isLoading && <p className="my-reports-state" role="status">{t('report.loading')}</p>}
        {Boolean(error) && <div className="my-reports-retry">
          <span className="my-reports-retry-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4M9 16h6M9 12h3" /><circle cx="18" cy="6" r="4" /><path d="M18 4.5v1.8M18 8h.01" /></svg>
          </span>
          <p className="my-reports-retry-message" role="alert">{reportReadErrorMessage(error, locale)}</p>
          <button type="button" className="my-reports-retry-button" onClick={retryReports} disabled={isLoading || history.loadingMore || history.loadingFocus}>{t('common.retry')}</button>
        </div>}
        {!isLoading && !error && visibleReports.length === 0 && <div className="my-reports-empty history-empty"><strong>{t('report.empty')}</strong><p>{t('report.emptyHint')}</p></div>}
        {!isLoading && !firstError && visibleReports.map((report) => {
          const expanded = expandedId === report.id
          const originalTag = locale !== 'ko' ? <small className="original-text-tag">{t('content.original')}</small> : null
          return <article key={report.id} ref={report.id === initialExpandedId ? focusedReportRef : undefined} className={`my-report-item is-${report.status.toLowerCase()}${report.id === initialExpandedId ? ' is-focused' : ''}`}>
            <button type="button" className="my-report-summary" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : report.id)}>
              <span className="my-report-type">{report.reportType === 'FACILITY_MISSING' ? quickReportMessage(locale, 'missing') : report.reportType === 'TEMPORARILY_CLOSED' ? quickReportMessage(locale, 'closed') : report.reportType === 'NEW_FACILITY' ? quickReportMessage(locale, 'new') : t(reportTypeLabel(report.reportType))}</span>
              <strong>{report.toiletName || (report.toiletId ? t('report.toilet', { id: report.toiletId }) : quickReportMessage(locale, 'new'))}</strong>
              <span className={`my-report-status is-${report.status.toLowerCase()}`}>{t(statusLabel[report.status])}</span>
              <time>{formatDate(report.createdAt)}</time>
              <i aria-hidden="true" />
            </button>
            {expanded && <div className="my-report-detail">
              <dl>
                {['COORDINATE_CORRECTION', 'NEW_FACILITY', 'FACILITY_MISSING'].includes(report.reportType) && <div><dt>{t('report.address')}</dt><dd>{getDisplayAddress(report.roadAddress, report.jibunAddress) && originalTag}{getDisplayAddress(report.roadAddress, report.jibunAddress) || t('map.noAddress')}</dd></div>}
                {report.reportType === 'OPEN_TIME_CORRECTION' && <div><dt>{t('report.openTime')}</dt><dd>{report.openTime && originalTag}{report.openTime || t('common.noInfo')}</dd></div>}
                {report.reason && <div><dt>{t('report.reason')}</dt><dd>{report.reason && originalTag}{report.reason}</dd></div>}
                {report.observedAt && <div><dt>{quickReportMessage(locale, 'observed')}</dt><dd>{formatDate(report.observedAt)} · KST</dd></div>}
                {report.reviewedAt && <div><dt>{t('report.reviewedAt')}</dt><dd>{formatDate(report.reviewedAt)}</dd></div>}
              </dl>
              {report.status === 'PENDING' && <p className="my-report-review-note is-pending">{t('report.reviewing')}</p>}
              {report.status !== 'PENDING' && <div className="my-report-review-note"><span>{t('report.note')}</span><p>{report.reviewNote?.trim() && originalTag}{report.reviewNote?.trim() || t('report.noNote')}</p></div>}
            </div>}
          </article>
        })}
        {history.loadingMore && <p className="my-reports-state" role="status">{t('report.loading')}</p>}
        {!isLoading && !firstError && <HistoryMore count={history.hasNext ? Math.min(visibleReports.length, Math.max(0, history.total - 1)) : history.total} total={history.total} onMore={() => { void history.loadMore() }} disabled={history.loadingMore} autoLoad={!error} />}
      </div>
    </section>
  </div>
}
