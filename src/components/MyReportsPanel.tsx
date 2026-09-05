import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchMyToiletReports, type ToiletReport, type ToiletReportStatus } from '../api/reports'
import { getDisplayAddress } from '../lib/address'

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
  ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : '-'

export function MyReportsPanel({ onClose, initialExpandedId = null }: { onClose: () => void; initialExpandedId?: number | null }) {
  const [reports, setReports] = useState<ToiletReport[]>([])
  const [filter, setFilter] = useState<Filter>('ALL')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(initialExpandedId)
  const focusedReportRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let active = true
    void fetchMyToiletReports()
      .then((items) => { if (active) setReports(items) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : '내 제보를 불러오지 못했습니다.') })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [])

  const visibleReports = useMemo(
    () => filter === 'ALL' ? reports : reports.filter((report) => report.status === filter),
    [filter, reports],
  )

  useEffect(() => {
    if (!initialExpandedId || isLoading || !focusedReportRef.current) return
    focusedReportRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [initialExpandedId, isLoading])

  return <div className="my-reports-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="my-reports-panel" role="dialog" aria-modal="true" aria-labelledby="my-reports-title">
      <header className="my-reports-header">
        <div><span>급똥 계정</span><h1 id="my-reports-title">내 제보</h1><p>제보 처리 상태와 관리자 검토 내용을 확인할 수 있어요.</p></div>
        <button type="button" onClick={onClose} aria-label="내 제보 닫기">×</button>
      </header>
      <nav className="my-reports-filters" aria-label="제보 상태 필터">
        {filters.map((item) => <button key={item.value} type="button" className={filter === item.value ? 'is-active' : ''} onClick={() => setFilter(item.value)}>
          {item.label}<span>{item.value === 'ALL' ? reports.length : reports.filter((report) => report.status === item.value).length}</span>
        </button>)}
      </nav>
      <div className="my-reports-content">
        {isLoading && <p className="my-reports-state">내 제보를 불러오는 중…</p>}
        {error && <p className="my-reports-state is-error" role="alert">{error}</p>}
        {!isLoading && !error && visibleReports.length === 0 && <div className="my-reports-empty"><strong>표시할 제보가 없어요</strong><p>화장실 상세 정보에서 위치나 개방시간 정보를 제보할 수 있습니다.</p></div>}
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
      </div>
    </section>
  </div>
}
