import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { historyToday, historyRange, historyRangeProblem, historyTimestamp, selectHistory, historyWindowSize } from '../src/lib/history.ts'

test('history periods are calendar days in Korea, inclusive of today', () => {
  assert.equal(historyToday(Date.parse('2026-09-10T15:00:00Z')), '2026-09-11')
  assert.deepEqual(historyRange('7', '2026-09-11'), { period: '7', from: '2026-09-05', to: '2026-09-11' })
  assert.equal(historyRange('30', '2026-09-11').from, '2026-08-13')
  assert.equal(historyRange('7', '2026-01-02').from, '2025-12-27')
  assert.equal(historyRange('7', '2024-03-01').from, '2024-02-24')
  assert.equal(historyRangeProblem('2024-02-29','2024-02-29','2026-09-11'), null)
})
test('history date picker rejects missing, invalid, reversed and future dates', () => {
  assert.equal(historyRangeProblem('2026-09-11','2026-09-11','2026-09-11'), null)
  for (const pair of [['','2026-09-11'],['2026-02-30','2026-09-11'],['2026-09-11','2026-09-10'],['2026-09-11','2026-09-12']]) assert.notEqual(historyRangeProblem(...pair,'2026-09-11'), null)
})
test('history range includes the entire end date, sorts creation newest-first without mutating input', () => {
  const items = [
    { id: 'old', createdAt: '2026-09-04T23:59:59.999' },
    { id: 'start', createdAt: '2026-09-05T00:00:00' },
    { id: 'end', createdAt: '2026-09-11T23:59:59.999+09:00' },
    { id: 'next', createdAt: '2026-09-12T00:00:00+09:00' },
    { id: 'invalid', createdAt: 'invalid' },
  ]
  assert.deepEqual(selectHistory(items,historyRange('7','2026-09-11')).map(x=>x.id), ['end','start'])
  assert.equal(items[0].id, 'old')
  assert.equal(selectHistory(items,historyRange('all','2026-09-11')).length, 4)
  assert.equal(historyTimestamp('2026-09-11T12:00:00'),Date.parse('2026-09-11T03:00:00Z'))
})
test('history reveals ten at a time and focused notifications can reach an older record', () => {
  assert.equal(historyWindowSize(10,25),10)
  assert.equal(historyWindowSize(20,25),20)
  assert.equal(historyWindowSize(30,25),25)
  assert.equal(historyWindowSize(10,25,22),25)
  assert.equal(historyWindowSize(10,0),0)
})
test('mobile report and review history stay in the shell; filtering never introduces business writes', () => {
  const read = path => readFileSync(new URL('../src/'+path,import.meta.url),'utf8')
  const app = read('App.tsx'), mobile = read('components/MobileNavigation.tsx')
  assert.match(app,/setMobileTab\('account'\); setMobileAccountView\('reports'\)/)
  assert.match(app,/embedded: !isDesktop/)
  assert.match(mobile,/accountView === 'reports' \? <MyReportsPanel[^\n]+embedded/)
  assert.match(mobile,/accountView === 'reviews' && onReviews \? reviewPage/)
  assert.match(read('components/HistoryControls.tsx'),/IntersectionObserver/)
  for (const file of ['components/HistoryControls.tsx','lib/useHistoryWindow.ts','components/MyReportsPanel.tsx']) assert.doesNotMatch(read(file),/method:\s*['"](?:POST|DELETE|PATCH)|location.assign\(/)
})
