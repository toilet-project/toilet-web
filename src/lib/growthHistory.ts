export type GrowthHistoryDirection = 'earned' | 'deducted'
export type GrowthHistoryItem = { id: string; deltaXp: number; type: string; reason: string; happenedAt: string }
export type GrowthHistoryPage = { items: GrowthHistoryItem[]; total: number; page: number; size: number; scope: 'all' | 'recent' }
export const GROWTH_HISTORY_PAGE_SIZE = 10

/** The API stores local Korean time. Never reinterpret it in the browser's timezone. */
export function growthHistoryDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)) return null
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}+09:00`)
  return Number.isFinite(date.getTime()) ? date : null
}

export function decodeGrowthHistory(value: unknown): GrowthHistoryItem[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { items?: unknown }).items)) throw new Error('INVALID_GROWTH_HISTORY')
  return (value as { items: unknown[] }).items.map(item => {
    if (!item || typeof item !== 'object') throw new Error('INVALID_GROWTH_HISTORY')
    const v = item as Record<string, unknown>
    if (!(typeof v.id === 'string' && /^[1-9]\d*$/.test(v.id) || Number.isSafeInteger(v.id) && Number(v.id) > 0)
      || !Number.isSafeInteger(v.deltaXp) || v.deltaXp === 0 || typeof v.type !== 'string' || typeof v.reason !== 'string'
      || typeof v.happenedAt !== 'string' || !growthHistoryDate(v.happenedAt)) throw new Error('INVALID_GROWTH_HISTORY')
    return { id: String(v.id), deltaXp: Number(v.deltaXp), type: v.type, reason: v.reason, happenedAt: v.happenedAt }
  })
}

export function decodeGrowthHistoryPage(value: unknown, direction: GrowthHistoryDirection, page: number): GrowthHistoryPage {
  const items = decodeGrowthHistory(value)
  const data = value as Record<string, unknown>
  const belongs = (item: GrowthHistoryItem) => direction === 'earned' ? item.deltaXp > 0 : item.deltaXp < 0
  if ('total' in data || 'page' in data || 'size' in data) {
    if (!Number.isSafeInteger(data.total) || Number(data.total) < 0 || data.page !== page || data.size !== GROWTH_HISTORY_PAGE_SIZE
      || items.length > GROWTH_HISTORY_PAGE_SIZE || items.some(item => !belongs(item))
      || items.length !== Math.min(GROWTH_HISTORY_PAGE_SIZE, Math.max(0, Number(data.total) - page * GROWTH_HISTORY_PAGE_SIZE))) throw new Error('INVALID_GROWTH_HISTORY_PAGE')
    return { items, total: Number(data.total), page, size: GROWTH_HISTORY_PAGE_SIZE, scope: 'all' }
  }
  // Compatibility with the existing API: these are only the latest 50 events,
  // so never present this filtered count as the total across the full ledger.
  const filtered = items.filter(belongs)
  return { items: filtered.slice(page * GROWTH_HISTORY_PAGE_SIZE, (page + 1) * GROWTH_HISTORY_PAGE_SIZE), total: filtered.length, page, size: GROWTH_HISTORY_PAGE_SIZE, scope: 'recent' }
}

export function growthHistoryReason(reason: string): 'daily' | 'review' | 'edited' | 'unlinked' | 'excluded' | 'restored' | 'unlinkRestored' | 'reconciled' | 'backfill' | 'adjustment' {
  switch (reason) {
    case 'DAILY_CHECKIN': return 'daily'
    case 'REVIEW_CREATED': return 'review'
    case 'REVIEW_EDITED': return 'edited'
    case 'REVIEW_UNLINK': return 'unlinked'
    case 'REVIEW_EXCLUDED': return 'excluded'
    case 'REVIEW_RESTORED': return 'restored'
    case 'REVIEW_UNLINK_RESTORE': return 'unlinkRestored'
    case 'BACKFILL': return 'backfill'
    case 'RECONCILE': return 'reconciled'
    default: return 'adjustment'
  }
}
