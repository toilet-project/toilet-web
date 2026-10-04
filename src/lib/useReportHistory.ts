import { useEffect, useRef, useState } from 'react'
import { fetchMyToiletReport, fetchMyToiletReports } from '../api/reports'
import { AuthExpiredError } from '../api/auth'
import type { HistoryRange } from './history'
import { createReportHistoryPager, emptyReportHistory, type ReportFilter, type ReportHistorySnapshot } from './reportHistory'

export function useReportHistory(range: HistoryRange, filter: ReportFilter, focusId: number | null, onSessionExpired: () => void) {
  const expireRef = useRef(onSessionExpired)
  useEffect(() => { expireRef.current = onSessionExpired }, [onSessionExpired])
  const scope = JSON.stringify([range.period, range.from, range.to, filter, focusId])
  const dateScope = JSON.stringify([range.period, range.from, range.to])
  const [snapshot, setSnapshot] = useState<{ scope: string; dateScope: string; value: ReportHistorySnapshot } | null>(null)
  const pagerRef = useRef<ReturnType<typeof createReportHistoryPager> | null>(null)
  useEffect(() => {
    const pager = createReportHistoryPager(
      page => fetchMyToiletReports(range, filter, page), focusId ? () => fetchMyToiletReport(focusId) : null,
      value => setSnapshot(previous => ({ scope, dateScope,
        value: value.loading && !value.items.length && !value.total && previous?.dateScope === dateScope
          ? { ...value, counts: previous.value.counts, total: previous.value.counts[filter] } : value,
      })), reason => {
        if (!(reason instanceof AuthExpiredError)) return false
        expireRef.current()
        return true
      },
    )
    pagerRef.current = pager
    void pager.start()
    return pager.dispose
  }, [scope, dateScope, range, filter, focusId])
  const pending = { ...emptyReportHistory(), ...(snapshot?.dateScope === dateScope ? { counts: snapshot.value.counts, total: snapshot.value.counts[filter] } : {}) }
  return { ...(snapshot?.scope === scope ? snapshot.value : pending),
    loadMore: () => pagerRef.current?.more(), retry: () => pagerRef.current?.retry() }
}
