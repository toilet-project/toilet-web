import test from 'node:test'
import assert from 'node:assert/strict'
import { reportDestination, sendQuickReport } from '../src/lib/quickReportTransport.ts'
const api = 'https://api.geupddong.com'
test('isolated preview never falls back to production; release needs exact host and API', () => {
  assert.equal(reportDestination('preview.geupddong.com', true, true, api, 'member').url, '/__report-preview/api/v1/reports/guest')
  for (const args of [ ['preview.geupddong.com', false, true, api, 'member'], ['geupddong.com', true, false, api, 'guest'], ['evil.test', false, true, api, 'guest'], ['geupddong.com', false, true, 'https://evil.test', 'guest'], ['geupddong.com', false, false, api, 'guest'], ['geupddong.com', false, true, api, 'loading'] ]) assert.throws(() => reportDestination(...args))
})
test('member and guest receipts preserve idempotency without sharing credentials', async () => {
  for (const identity of ['guest', 'member']) {
    const dest = reportDestination('geupddong.com', false, true, api, identity)
    await sendQuickReport(dest, { reportType: 'FACILITY_MISSING', toiletId: 42 }, 'request-id', () => 'guest-id', async (url, init) => {
      assert.equal(url, api + '/api/v1/reports/' + (identity === 'guest' ? 'guest' : 'quick'))
      assert.equal(init.credentials, identity === 'guest' ? 'omit' : 'include')
      assert.equal(init.headers['X-Report-Guest'], identity === 'guest' ? 'guest-id' : undefined)
      assert.equal(init.headers['Idempotency-Key'], 'request-id')
      assert.equal(init.cache, 'no-store'); assert.equal(init.redirect, 'error')
      return Response.json({ id: 42, status: 'PENDING' }, { status: 201 })
    })
  }
})
test('expired member is not silently resubmitted as guest and invalid receipts fail', async () => {
  const dest = reportDestination('geupddong.com', false, true, api, 'member')
  let calls = 0
  await assert.rejects(sendQuickReport(dest, {}, 'id', () => { throw Error('must not generate guest') }, async () => { calls++; return Response.json({}, { status: 401 }) }), { status: 401 })
  assert.equal(calls, 1)
  await assert.rejects(sendQuickReport(dest, {}, 'id', () => '', async () => Response.json({ status: 'PENDING' })), /INVALID_RECEIPT/)
})
