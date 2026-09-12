const DAY = 86_400_000
const date = (value: string) => new Date(`${value}T00:00:00Z`)
const iso = (value: Date) => value.toISOString().slice(0, 10)
export const calendarDayLabel = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  return `${year}년 ${month}월 ${day}일`
}
export const calendarShiftDay = (value: string, days: number) => iso(new Date(date(value).getTime() + days * DAY))
export const calendarWeekday = (value: string) => date(value).getUTCDay()
export function calendarShiftMonth(value: string, amount: number) {
  const next = date(`${value.slice(0, 7)}-01`)
  next.setUTCMonth(next.getUTCMonth() + amount)
  return iso(next).slice(0, 7)
}
export function calendarMonthDays(month: string): (string | null)[] {
  const first = `${month}-01`, next = `${calendarShiftMonth(first, 1)}-01`
  const days = Math.round((date(next).getTime() - date(first).getTime()) / DAY)
  const cells: (string | null)[] = Array(calendarWeekday(first)).fill(null)
  for (let day = 0; day < days; day++) cells.push(calendarShiftDay(first, day))
  while (cells.length % 7) cells.push(null)
  return cells
}
