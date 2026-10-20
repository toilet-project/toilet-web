import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeGrowthHistoryPage, growthHistoryDate, growthHistoryReason, growthHistoryActivity } from '../src/lib/growthHistory.ts'
import { experienceHistoryText } from '../src/i18n/experienceHistoryText.ts'

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

test('reward metadata distinguishes review XP, neighborhood badges and every medal from the same trigger', () => {
  const kinds = { CHECKIN: 'daily', REVIEW_FIRST: 'reviewReward', DISTRICT: 'district', MEDAL_BRONZE: 'bronzeMedal', MEDAL_SILVER: 'silverMedal', MEDAL_GOLD: 'goldMedal' }
  for (const [awardKind, label] of Object.entries(kinds)) {
    const item = { ...event(1, 30), awardKind }
    assert.deepEqual(growthHistoryActivity(item), { label, qualifier: null })
    assert.deepEqual(growthHistoryActivity({ ...item, reason: 'BACKFILL' }), { label, qualifier: 'activityBackfill' })
    // Sign is authoritative even if the original trigger or event type is misleading.
    assert.deepEqual(growthHistoryActivity({ ...item, deltaXp: -30, reason: 'BACKFILL' }), { label, qualifier: 'activityReversal' })
    assert.deepEqual(growthHistoryActivity({ ...item, reason: 'REVIEW_RESTORED' }), { label, qualifier: null })
  }
})

test('old, null and unknown reward metadata retain neutral trigger labels without guessing from amounts', () => {
  for (const awardKind of [undefined, null, '', 'NEW_KIND', '__proto__', 'toString']) {
    for (const deltaXp of [10, 20, 30, 50, 100, -30]) {
      assert.deepEqual(growthHistoryActivity({ ...event(1, deltaXp), awardKind }), { label: 'review', qualifier: null })
      assert.deepEqual(growthHistoryActivity({ ...event(1, deltaXp), awardKind, reason: 'BACKFILL' }), { label: 'backfill', qualifier: null })
    }
  }
})

test('metadata is optional for existing servers and retained without altering recorded XP, IDs or dates', () => {
  for (const awardKind of [undefined, null, 'MEDAL_BRONZE', 'FUTURE_KIND']) {
    const item = { ...event('90071992547409931', 30), ...(awardKind !== undefined ? { awardKind } : {}) }
    assert.deepEqual(decodeGrowthHistoryPage({ items: [item], total: 1, page: 0, size: 10 }, 'earned', 0).items, [item])
  }
  assert.throws(() => decodeGrowthHistoryPage({ items: [{ ...event(1), awardKind: { type: 'MEDAL_GOLD' } }] }, 'earned', 0))
})

test('all supported locales have distinct medal, review, retroactive and revoked wording', () => {
  for (const locale of ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK']) {
    const t = experienceHistoryText(locale)
    assert.equal(new Set([t.reviewReward, t.district, t.bronzeMedal, t.silverMedal, t.goldMedal]).size, 5)
    assert.ok(t.activityBackfill.includes('{activity}'))
    assert.ok(t.activityReversal.includes('{activity}'))
    assert.notEqual(t.activityBackfill, t.activityReversal)
  }
  const t = experienceHistoryText('ko')
  assert.equal(t.activityBackfill.replace('{activity}', t.bronzeMedal), '지역 동메달 획득 (소급)')
})
