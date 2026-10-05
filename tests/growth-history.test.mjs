import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeGrowthHistoryPage, growthHistoryDate, growthHistoryReason } from '../src/lib/growthHistory.ts'

const event = (id, deltaXp = 10) => ({ id: String(id), deltaXp, type: deltaXp > 0 ? 'EARN' : 'REVOKE', reason: 'REVIEW_CREATED', happenedAt: '2026-10-05T20:30:00.123456' })

test('history keeps event order and exact large IDs while consuming server pages', () => {
  const items = [event('90071992547409931'), event('90071992547409930')]
  const page = decodeGrowthHistoryPage({ items, total: 12, page: 1, size: 10 }, 'earned', 1)
  assert.deepEqual(page.items.map(item => item.id), ['90071992547409931', '90071992547409930'])
  assert.equal(page.scope, 'all')
  assert.equal(page.total, 12)
})

test('legacy responses page each direction in tens without claiming full-ledger coverage', () => {
  const items = Array.from({ length: 50 }, (_, index) => event(100 - index, index % 2 ? -10 : 10))
  const earned = decodeGrowthHistoryPage({ items }, 'earned', 1)
  assert.equal(earned.scope, 'recent')
  assert.equal(earned.total, 25)
  assert.equal(earned.items.length, 10)
  assert.equal(earned.items[0].id, '80')
  const deducted = decodeGrowthHistoryPage({ items }, 'deducted', 2)
  assert.equal(deducted.items.length, 5)
  assert.equal(deducted.items[0].id, '59')
  assert.ok(deducted.items.every(item => item.deltaXp < 0))
})

test('incorrect direction, pagination metadata, unsafe IDs and invalid events fail closed', () => {
  assert.throws(() => decodeGrowthHistoryPage({ items: [event(1, -10)], total: 1, page: 0, size: 10 }, 'earned', 0))
  assert.throws(() => decodeGrowthHistoryPage({ items: [event(1)], total: 1, page: 1, size: 10 }, 'earned', 0))
  assert.throws(() => decodeGrowthHistoryPage({ items: [{ ...event(1), id: 9007199254740992 }] }, 'earned', 0))
  assert.throws(() => decodeGrowthHistoryPage({ items: [event(1, 0)] }, 'earned', 0))
  assert.throws(() => decodeGrowthHistoryPage({ items: [{ ...event(1), happenedAt: 'not a date' }] }, 'earned', 0))
})

test('offset-free server times are interpreted in Korea and explicit offsets are retained', () => {
  assert.equal(growthHistoryDate('2026-10-05T20:30:00.123456')?.toISOString(), '2026-10-05T11:30:00.123Z')
  assert.equal(growthHistoryDate('2026-10-05T11:30:00Z')?.toISOString(), '2026-10-05T11:30:00.000Z')
  assert.equal(growthHistoryDate('bad'), null)
})

test('activity labels do not invent a reward type or expose unknown internal reason codes', () => {
  assert.equal(growthHistoryReason('REVIEW_CREATED'), 'review')
  assert.equal(growthHistoryReason('REVIEW_EXCLUDED'), 'excluded')
  assert.equal(growthHistoryReason('BACKFILL'), 'backfill')
  assert.equal(growthHistoryReason('NEW_INTERNAL_REASON'), 'adjustment')
})
