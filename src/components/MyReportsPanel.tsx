import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchMyToiletReports, type ToiletReport, type ToiletReportStatus } from '../api/reports'
import { getDisplayAddress } from '../lib/address'
import { reportReadErrorMessage } from '../lib/report-error'
import { AuthExpiredError } from '../api/auth'
import { useDialogFocus } from '../lib/useDialogFocus'
import { historyDateLabel, historyRange, selectHistory, type HistoryRange } from '../lib/history'
import { HistoryFilters, HistoryHeading, HistoryMore } from './HistoryControls'
import { historyScroller, useHistoryWindow } from '../lib/useHistoryWindow'

type Filter = 'ALL' | ToiletReportStatus

const filters: { value: Filter; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'PENDING', label: '대기' },
  { value: 'APPROVED', label: '승인' },
  { value: 'REJECTED', label: '반려' },
  { value: 'CANCELLED', label: '취소' },
]

const statusLabel: Record<ToiletReportStatus, string> = {
  PENDING: '검토 대기', APPROVED: '승인', REJECTED: '반려', CANCELLED: '취소',
}

const reportTypeLabel = (type: ToiletReport['reportType']) => type === 'COORDINATE_CORRECTION' ? '위치 제보' : '개방시간 제보'
const formatDate = (value?: string | null) => value
  ? historyDateLabel(value)
  : '-'

export function MyReportsPanel({ onClose, onSessionExpired, initialExpandedId = null, embedded = false, onBack }: { onClose: () => void; onSessionExpired: () => void; initialExpandedId?: number | null; embedded?: boolean; onBack?: () => void }) {
  const dialog = useDialogFocus(!embedded, onClose)
  const expireRef = useRef(onSessionExpired)
  useEffect(() => { expireRef.current = onSessionExpired }, [onSessionExpired])
  const [reports, setReports] = useState<ToiletReport[]>([])
  const [filter, setFilter] = useState<Filter>('ALL')
  const [range, setRange] = useState<HistoryRange>(() => historyRange(initialExpandedId ? 'all' : '7'))
  const [focusInitial, setFocusInitial] = useState(Boolean(initialExpandedId))
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requestVersion, setRequestVersion] = useState(0)
  const [expandedId, setExpandedId] = useState<number | null>(initialExpandedId)
  const focusedReportRef = useRef<HTMLElement | null>(null)
  const titleId = embedded ? 'mobile-my-reports-title' : 'my-reports-title'

  useEffect(() => {
    let active = true
    void fetchMyToiletReports()
      .then((items) => { if (active) setReports(items) })
      .catch((reason: unknown) => {
        if (!active) return
        if (reason instanceof AuthExpiredError) { setReports([]); expireRef.current(); return }
        setError(reportReadErrorMessage(reason))
      })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [requestVersion])

  const retryReports = () => {
    if (isLoading) return
    setError(null)
    setIsLoading(true)
    setRequestVersion((version) => version + 1)
  }

  const datedReports = useMemo(() => selectHistory(reports, range), [reports, range])
  const matchingReports = useMemo(
    () => filter === 'ALL' ? datedReports : datedReports.filter((report) => report.status === filter),
    [filter, datedReports],
  )
  const page = useHistoryWindow(matchingReports.length, JSON.stringify(range) + filter, focusInitial ? matchingReports.findIndex(report => report.id === initialExpandedId) : -1)
  const visibleReports = matchingReports.slice(0, page.count)
  const reset = () => { page.reset(); setExpandedId(null); setFocusInitial(false) }

  useEffect(() => {
    if (!focusInitial || !initialExpandedId || isLoading || !focusedReportRef.current) return
    const scroll = historyScroller(focusedReportRef.current)
    if (scroll) scroll.scrollTop += focusedReportRef.current.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 16
  }, [initialExpandedId, isLoading, focusInitial])

  return <div className={`history-list ${embedded ? 'my-reports-embedded' : 'my-reports-backdrop'}`} onMouseDown={(event) => { if (!embedded && event.target === event.currentTarget) onClose() }}>
    <section ref={dialog} tabIndex={embedded ? undefined : -1} className="my-reports-panel" role={embedded ? undefined : 'dialog'} aria-modal={embedded ? undefined : true} aria-labelledby={titleId}>
      <div className="my-reports-header">
        <HistoryHeading id={titleId} title="내 제보" description="제보 처리 상태와 관리자 검토 내용을 확인할 수 있어요." onBack={onBack} />
        {!embedded && <button type="button" onClick={onClose} aria-label="내 제보 닫기">×</button>}
      </div>
      <HistoryFilters value={range} onChange={value => { reset(); setRange(value) }} count={matchingReports.length} />
      <nav className="my-reports-filters" aria-label="제보 상태 필터">
        {filters.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} className={filter === item.value ? 'is-active' : ''} onClick={() => { reset(); setFilter(item.value) }}>
          {item.label}<span>{item.value === 'ALL' ? datedReports.length : datedReports.filter((report) => report.status === item.value).length}</span>
        </button>)}
      </nav>
      <div className="my-reports-content" aria-busy={isLoading}>
        {isLoading && <p className="my-reports-state" role="status">내 제보를 불러오는 중…</p>}
        {error && <div className="my-reports-retry">
          <span className="my-reports-retry-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4M9 16h6M9 12h3" /><circle cx="18" cy="6" r="4" /><path d="M18 4.5v1.8M18 8h.01" /></svg>
          </span>
          <p className="my-reports-retry-message" role="alert">{error}</p>
          <button type="button" className="my-reports-retry-button" onClick={retryReports} disabled={isLoading}>다시 불러오기</button>
        </div>}
        {!isLoading && !error && visibleReports.length === 0 && <div className="my-reports-empty history-empty"><strong>이 기간에 표시할 제보가 없어요</strong><p>기간이나 상태를 바꾸어 확인해 보세요.</p></div>}
        {!isLoading && !error && visibleReports.map((report) => {
          const expanded = expandedId === report.id
          return <article key={report.id} ref={report.id === initialExpandedId ? focusedReportRef : undefined} className={`my-report-item is-${report.status.toLowerCase()}${report.id === initialExpandedId ? ' is-focused' : ''}`}>
            <button type="button" className="my-report-summary" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : report.id)}>
              <span className="my-report-type">{reportTypeLabel(report.reportType)}</span>
              <strong>{report.toiletName || `화장실 #${report.toiletId}`}</strong>
              <span className={`my-report-status is-${report.status.toLowerCase()}`}>{statusLabel[report.status]}</span>
              <time>{formatDate(report.createdAt)}</time>
              <i aria-hidden="true" />
            </button>
            {expanded && <div className="my-report-detail">
              <dl>
                {report.reportType === 'COORDINATE_CORRECTION' && <div><dt>제보 주소</dt><dd>{getDisplayAddress(report.roadAddress, report.jibunAddress) || '주소 정보 없음'}</dd></div>}
                {report.reportType === 'OPEN_TIME_CORRECTION' && <div><dt>제보 개방시간</dt><dd>{report.openTime || '입력 정보 없음'}</dd></div>}
                <div><dt>제보 사유</dt><dd>{report.reason}</dd></div>
                {report.reviewedAt && <div><dt>처리 일시</dt><dd>{formatDate(report.reviewedAt)}</dd></div>}
              </dl>
              {report.status === 'PENDING' && <p className="my-report-review-note is-pending">관리자가 내용을 확인하고 있습니다.</p>}
              {report.status !== 'PENDING' && <div className="my-report-review-note"><span>관리자 메모</span><p>{report.reviewNote?.trim() || '별도 메모가 없습니다.'}</p></div>}
            </div>}
          </article>
        })}
        {!isLoading && !error && <HistoryMore count={page.count} total={matchingReports.length} onMore={page.loadMore} />}
      </div>
    </section>
  </div>
}
