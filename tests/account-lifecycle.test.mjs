import assert from 'node:assert/strict'
import test from 'node:test'
import { lifecycleErrorMessage, recoveryReceipt, withdrawalReceipt } from '../src/lib/accountLifecycle.ts'

test('withdrawal only claims completion for the documented response', () => {
  assert.deepEqual(withdrawalReceipt(204, false), { erasurePending: false, purgeAfter: undefined })
  assert.equal(withdrawalReceipt(200, true, { purgeAfter: '2026-12-08T14:00:00+09:00' }).purgeAfter, '2026-12-08T14:00:00+09:00')
  for (const retain of [false, true]) assert.equal(withdrawalReceipt(202, retain).erasurePending, true)
})

test('unexpected 2xx and malformed retention receipts never claim completion', () => {
  for (const status of [201, 203, 205, 206]) assert.throws(() => withdrawalReceipt(status, false))
  assert.throws(() => withdrawalReceipt(204, true))
  assert.throws(() => withdrawalReceipt(200, false, {}))
  for (const body of [null, {}, { purgeAfter: 'invalid' }, { purgeAfter: '2026-12-08T14:00:00' }]) {
    assert.throws(() => withdrawalReceipt(200, true, body))
  }
})

test('pending deletion does not count as a restored login', () => {
  assert.equal(recoveryReceipt(202, 'ERASE').erasurePending, true)
  assert.throws(() => recoveryReceipt(202, 'RESTORE'))
  for (const action of ['RESTORE', 'ERASE']) {
    assert.equal(recoveryReceipt(204, action).erasurePending, false)
    assert.throws(() => recoveryReceipt(200, action))
  }
})

test('maintenance and expired authentication have different instructions', () => {
  assert.match(lifecycleErrorMessage(503, 'fallback'), /점검 중/)
  assert.doesNotMatch(lifecycleErrorMessage(503, 'fallback'), /만료|보관 기간/)
  assert.match(lifecycleErrorMessage(401, 'fallback'), /인증 시간이 만료/)
  assert.equal(lifecycleErrorMessage(500, 'fallback'), 'fallback')
  assert.throws(() => withdrawalReceipt(503, false), /점검 중/)
  assert.throws(() => recoveryReceipt(401, 'RESTORE'), /인증 시간이 만료/)
})
