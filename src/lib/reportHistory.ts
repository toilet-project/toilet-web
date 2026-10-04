import type { ToiletReport, ToiletReportStatus } from '../api/reports.ts'
import { historyTimestamp, type HistoryRange } from './history.ts'

export type ReportFilter = 'ALL' | ToiletReportStatus
export type ReportCounts = Record<ReportFilter, number>
export type ReportHistoryPage = { items: ToiletReport[]; page: number; size: number; totalElements: number; hasNext: boolean; statusCounts: ReportCounts }
const statuses = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const
export const emptyReportCounts = (): ReportCounts => ({ ALL: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 })
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0
const malformed = () => new Error('Invalid report history response')

export function reportHistoryPath(range: HistoryRange, filter: ReportFilter, page: number) {
  const query = new URLSearchParams({ page: String(page), size: '10' })
  if (range.period !== 'all') { query.set('from', range.from); query.set('to', range.to) }
  if (filter !== 'ALL') query.set('status', filter)
  return `/api/v1/reports/me/search?${query}`
}
export function decodeHistoryReport(value: unknown): ToiletReport {
  const r = value as ToiletReport | null
  if (!r || !integer(r.id) || r.id === 0 || (r.toiletId !== null && (!integer(r.toiletId) || r.toiletId === 0))
    || !statuses.includes(r.status) || !['COORDINATE_CORRECTION', 'OPEN_TIME_CORRECTION', 'FACILITY_MISSING', 'TEMPORARILY_CLOSED', 'NEW_FACILITY'].includes(r.reportType)
    || typeof r.createdAt !== 'string' || !Number.isFinite(historyTimestamp(r.createdAt))
    || (r.toiletName != null && typeof r.toiletName !== 'string') || (r.reason != null && typeof r.reason !== 'string')) throw malformed()
  return { ...r, toiletName: r.toiletName ?? '', reason: r.reason ?? '' }
}
export function decodeReportHistoryPage(value: unknown, page: number, filter: ReportFilter): ReportHistoryPage {
  const r = value as ReportHistoryPage | null
  if (!r || !Array.isArray(r.items) || r.page !== page || r.size !== 10 || r.items.length > 10
    || !integer(r.totalElements) || typeof r.hasNext !== 'boolean' || !r.statusCounts
    || !['ALL', ...statuses].every(key => integer(r.statusCounts[key as ReportFilter]))
    || r.statusCounts.ALL !== statuses.reduce((sum, key) => sum + r.statusCounts[key], 0)
    || r.totalElements !== r.statusCounts[filter] || (r.hasNext && !r.items.length)) throw malformed()
  const items = r.items.map(decodeHistoryReport)
  if (new Set(items.map(item => item.id)).size !== items.length) throw malformed()
  return { ...r, items }
}
export type ReportHistorySnapshot = {
  items: ToiletReport[]; focused: ToiletReport | null; total: number; counts: ReportCounts; hasNext: boolean;
  loading: boolean; loadingMore: boolean; loadingFocus: boolean; error: unknown; moreError: unknown; focusError: unknown
}
export const emptyReportHistory = (): ReportHistorySnapshot => ({ items: [], focused: null, total: 0, counts: emptyReportCounts(), hasNext: false,
  loading: true, loadingMore: false, loadingFocus: false, error: null, moreError: null, focusError: null })

/** One panel/owner only. A disposed or replaced query cannot publish private rows. */
export function createReportHistoryPager(readPage: (page: number) => Promise<ReportHistoryPage>, readFocus: (() => Promise<ToiletReport>) | null,
  publish: (value: ReportHistorySnapshot) => void, expired: (error: unknown) => boolean) {
  let state = emptyReportHistory(), generation = 0, disposed = false, nextPage = 1
  const active = (token: number) => !disposed && token === generation
  const update = (patch: Partial<ReportHistorySnapshot>) => { state = { ...state, ...patch }; publish(state) }
  const fail = (error: unknown, key: 'error' | 'moreError' | 'focusError') => {
    if (expired(error)) { update({ ...emptyReportHistory(), loading: false }); disposed = true; return }
    update({ [key]: error })
  }
  async function start() {
    if (disposed) return
    const token = ++generation
    nextPage = 1
    update({ ...emptyReportHistory(), loadingFocus: Boolean(readFocus) })
    if (readFocus) void readFocus().then(focused => { if (active(token)) update({ focused }) })
      .catch(error => { if (active(token)) fail(error, 'focusError') })
      .finally(() => { if (active(token)) update({ loadingFocus: false }) })
    try {
      const page = await readPage(0)
      if (active(token)) update({ items: page.items, total: page.totalElements, counts: page.statusCounts, hasNext: page.hasNext })
    } catch (error) { if (active(token)) fail(error, 'error') }
    finally { if (active(token)) update({ loading: false }) }
  }
  async function more() {
    if (disposed || state.loading || state.loadingMore || !state.hasNext || state.error) return
    const token = generation
    update({ loadingMore: true, moreError: null })
    try {
      const page = await readPage(nextPage)
      if (!active(token)) return
      const items = new Map(state.items.map(item => [item.id, item]))
      for (const item of page.items) items.set(item.id, item)
      nextPage += 1
      update({ items: [...items.values()], total: page.totalElements, counts: page.statusCounts, hasNext: page.hasNext })
    } catch (error) { if (active(token)) fail(error, 'moreError') }
    finally { if (active(token)) update({ loadingMore: false }) }
  }
  return { start, more, retry: () => {
    if (state.loading || state.loadingMore || state.loadingFocus) return
    return state.moreError ? more() : start()
  }, dispose: () => { disposed = true; generation += 1 } }
}
