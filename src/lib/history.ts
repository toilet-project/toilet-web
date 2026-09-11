export type HistoryPeriod = '7' | '30' | 'all' | 'custom'
export type HistoryRange = { period: HistoryPeriod; from: string; to: string }
const DAY = 86_400_000
export const historyToday = (now = Date.now()) => new Date(now + 9 * 3_600_000).toISOString().slice(0, 10)
const dayStart = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(`${value}T00:00:00+09:00`) : NaN
const validDay = (value: string) => Number.isFinite(dayStart(value)) && historyToday(dayStart(value)) === value
export function historyRange(period: Exclude<HistoryPeriod, 'custom'> = '7', today = historyToday()): HistoryRange {
  return { period, from: historyToday(dayStart(today) - (period === '30' ? 29 : 6) * DAY), to: today }
}
export function historyRangeProblem(from: string, to: string, today = historyToday()) {
  if (!validDay(from) || !validDay(to)) return '시작일과 종료일을 선택해 주세요.'
  if (from > to) return '종료일은 시작일 이후로 선택해 주세요.'
  if (to > today) return '오늘까지의 날짜를 선택할 수 있어요.'
  return null
}
/** API LocalDateTime is Korea time; ISO timestamps retain their explicit offset. */
export function historyTimestamp(value: string) {
  return Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !/(Z|[+-]\d{2}:\d{2})$/i.test(value) ? `${value}+09:00` : value)
}
export function selectHistory<T extends { createdAt: string }>(items: readonly T[], range: HistoryRange): T[] {
  const start = range.period === 'all' ? -Infinity : dayStart(range.from)
  const end = range.period === 'all' ? Infinity : dayStart(range.to) + DAY
  return items.filter(item => { const time = historyTimestamp(item.createdAt); return Number.isFinite(time) && time >= start && time < end })
    .sort((a, b) => historyTimestamp(b.createdAt) - historyTimestamp(a.createdAt))
}
export const historyDateLabel = (value: string) => {
  const time = historyTimestamp(value)
  return Number.isFinite(time) ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(time) : '-'
}
export const historyWindowSize = (requested: number, total: number, focusedIndex = -1) => Math.min(total, Math.max(requested, Math.ceil((focusedIndex + 1) / 10) * 10))
