import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createReportHistoryPager, decodeReportHistoryPage, emptyReportCounts, reportHistoryPath } from '../src/lib/reportHistory.ts'
import { historyRange } from '../src/lib/history.ts'

const report = id => ({ id, toiletId: 477, toiletName: '가상 시설', reportType: 'OPEN_TIME_CORRECTION', reason: '가상 제보', status: 'PENDING', createdAt: '2026-10-04T12:00:00' })
const page = (number, ids, total = 23) => ({ items: ids.map(report), page: number, size: 10, totalElements: total,
  hasNext: (number * 10 + ids.length) < total, statusCounts: { ...emptyReportCounts(), ALL: total, PENDING: total } })
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const settle = () => new Promise(resolve => setImmediate(resolve))

test('history requests ten filtered owner rows and all-time drops the date bounds', () => {
  assert.equal(reportHistoryPath(historyRange('7', '2026-10-04'), 'PENDING', 2), '/api/v1/reports/me/search?page=2&size=10&from=2026-09-28&to=2026-10-04&status=PENDING')
  assert.equal(reportHistoryPath(historyRange('all'), 'ALL', 0), '/api/v1/reports/me/search?page=0&size=10')
})
test('malformed page, duplicate IDs and misleading counts never become account rows', () => {
  const valid = page(0, [23, 22])
  assert.equal(decodeReportHistoryPage(valid, 0, 'ALL').items.length, 2)
  for (const bad of [ { ...valid, page: 1 }, { ...valid, size: 100 }, { ...valid, items: Array.from({ length: 11 }, (_, i) => report(i + 1)) },
    { ...valid, items: [report(23), report(23)] }, { ...valid, statusCounts: { ...valid.statusCounts, ALL: 100 } },
    { ...valid, items: [{ ...report(23), status: 'UNKNOWN' }] }, { ...valid, items: [] } ]) {
    assert.throws(() => decodeReportHistoryPage(bad, 0, 'ALL'))
  }
})
test('double more requests share one page; a failure retains rows and retries the same page', async () => {
  const pending = deferred(), requested = [], states = []
  let attempts = 0
  const pager = createReportHistoryPager(async number => {
    requested.push(number)
    if (number === 0) return page(0, [23, 22, 21, 20, 19, 18, 17, 16, 15, 14])
    if (++attempts === 1) return pending.promise
    return page(1, [14, 13, 12])
  }, null, value => states.push(value), () => false)
  await pager.start()
  const more = pager.more()
  await pager.more()
  assert.deepEqual(requested, [0, 1])
  pending.reject(new TypeError('fixture offline'))
  await more
  assert.equal(states.at(-1).items.length, 10)
  assert.ok(states.at(-1).moreError)
  await pager.retry()
  assert.deepEqual(requested, [0, 1, 1])
  assert.equal(states.at(-1).items.length, 12)
  assert.equal(states.at(-1).moreError, null)
  pager.dispose()
})
test('old filter or owner completion cannot publish after disposal', async () => {
  const pending = deferred(), states = []
  const old = createReportHistoryPager(() => pending.promise, null, value => states.push(value), () => false)
  const request = old.start()
  old.dispose()
  const published = states.length
  pending.resolve(page(0, [23]))
  await request
  assert.equal(states.length, published)
  assert.deepEqual(states.at(-1).items, [])
})
test('a notification reads its single older report without loading intermediate pages', async () => {
  const requested = [], states = []
  const pager = createReportHistoryPager(async number => { requested.push(number); return page(0, [23, 22]) },
    async () => report(1), value => states.push(value), () => false)
  await pager.start(); await settle()
  assert.deepEqual(requested, [0])
  assert.equal(states.at(-1).focused.id, 1)
  assert.deepEqual(states.at(-1).items.map(item => item.id), [23, 22])
})
test('expired focused read clears private history and ignores a later successful page', async () => {
  const pending = deferred(), states = []
  const pager = createReportHistoryPager(() => pending.promise, async () => { throw new Error('expired') },
    value => states.push(value), error => error.message === 'expired')
  const request = pager.start(); await settle()
  pending.resolve(page(0, [23]))
  await request
  assert.deepEqual(states.at(-1).items, [])
  assert.equal(states.at(-1).focused, null)
  assert.equal(states.at(-1).loading, false)
})
