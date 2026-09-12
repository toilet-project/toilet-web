import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarDayLabel, calendarMonthDays, calendarShiftDay, calendarShiftMonth, calendarWeekday } from '../src/lib/historyCalendar.ts'

test('calendar handles leap years, month boundaries and complete weekday rows', () => {
  assert.equal(calendarMonthDays('2024-02').filter(Boolean).length,29)
  assert.equal(calendarMonthDays('2025-02').filter(Boolean).length,28)
  const august=calendarMonthDays('2026-08')
  assert.equal(august.length,42)
  assert.deepEqual(august.slice(0,6),Array(6).fill(null))
  assert.equal(august[6],'2026-08-01')
  assert.equal(calendarShiftDay('2024-02-28',1),'2024-02-29')
  assert.equal(calendarShiftDay('2026-01-01',-1),'2025-12-31')
  assert.equal(calendarShiftMonth('2026-01-31',-1),'2025-12')
  assert.equal(calendarShiftMonth('2026-12-31',1),'2027-01')
  assert.equal(calendarWeekday('2026-09-06'),0)
  assert.equal(calendarDayLabel('2026-09-06'),'2026년 9월 6일')
})
