import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeGrowth, growthTotalXp, growthRankFor, growthIconPath } from '../src/lib/growth.ts'
import { createGrowthStore } from '../src/lib/growthStore.ts'
import { growthBadgePath } from '../src/lib/growthBadgeAssets.ts'

function summary(totalXp = 0, checkInAvailable = false) {
  const level = Math.floor(Math.sqrt(totalXp / 10 + 1)), nextLevel = level + 1, nextLevelXp = growthTotalXp(nextLevel)
  return { enabled: true, policyVersion: 'test', totalXp, level, rank: growthRankFor(level).key, nextLevel, nextLevelXp, remainingXp: nextLevelXp - totalXp, progressPercent: (totalXp - growthTotalXp(level)) / (nextLevelXp - growthTotalXp(level)) * 100, checkInAvailable, badges: [], regions: [] }
}
test('growth reads actual cumulative experience, including progress within a level', () => {
  for (const xp of [0, 29, 30, 79, 80, 239, 240, 989, 990, 1500, 2239, 2240, 6239, 6240, 15989, 15990]) assert.deepEqual(decodeGrowth(summary(xp)), summary(xp))
  const value = decodeGrowth(summary(1500))
  assert.equal(value.level, 12); assert.equal(value.remainingXp, 180); assert.ok(Math.abs(value.progressPercent - 28) < 0.000001)
  assert.equal(growthTotalXp(15) - value.totalXp, 740)
})
test('disabled and invalid growth responses cannot become invented member experience', () => {
  assert.deepEqual(decodeGrowth({ enabled: false, totalXp: 1500, badges: [{ name: 'fake' }] }), { enabled: false })
  for (const patch of [{ level: 0 }, { totalXp: -1 }, { totalXp: '1500' }, { rank: 'unknown' }, { remainingXp: 999 }, { nextLevelXp: 250 }, { progressPercent: Infinity }]) assert.throws(() => decodeGrowth({ ...summary(1500), ...patch }))
  assert.throws(() => decodeGrowth({ ...summary(), badges: [{ type: 'external', name: 'bad' }] }))
})
test('rank icons retain compact GIFs and honor reduced motion', () => {
  assert.equal(growthIconPath('black', 24, false), '/growth/rank-icons/v14/compact/07-legend.gif')
  assert.equal(growthIconPath('black', 24, true), '/growth/rank-icons/v14/compact/07-legend.svg')
  assert.equal(growthIconPath('red', 96, false), '/growth/rank-icons/v14/animated/05-star.gif')
  assert.equal(growthIconPath('white', 96, false), '/growth/rank-icons/v14/01-sprout.svg')
})
test('earned badge assets use the approved code and tier map without constructing unknown paths', () => {
  assert.equal(growthBadgePath({ type: 'district', code: '30140', tier: null }), '/growth/district-studies/v2/30140.svg')
  assert.equal(growthBadgePath({ type: 'regional_medal', code: '30', tier: 'gold' }), '/growth/badges/v13/new/standard-gold/30.svg')
  assert.equal(growthBadgePath({ type: 'regional_medal', code: '30', tier: 'bronze' }, 24), '/growth/badges/v13/new/compact-bronze/30.svg')
  assert.equal(growthBadgePath({ type: 'district', code: '__proto__', tier: null }), null)
  assert.equal(growthBadgePath({ type: 'district', code: '../../other', tier: null }), null)
})
test('header and account views share a pending summary and daily check-in request', async () => {
  let reads = 0, checks = 0, release
  const read = new Promise(resolve => { release = resolve })
  const store = createGrowthStore({ enabled: true, read: () => { reads++; return read }, checkIn: async () => { checks++; return summary(2) }, expired: () => false })
  const first = store.load('member'), second = store.load('member')
  assert.equal(reads, 1); release(summary(0, true)); await Promise.all([first, second])
  assert.equal(checks, 1); assert.equal(store.get('member').summary.totalXp, 2)
  await store.load('member'); assert.equal(reads, 1)
})
test('disabled flag makes no authenticated read or check-in request', async () => {
  const fail = async () => { throw new Error('must not request') }
  const store = createGrowthStore({ enabled: false, read: fail, checkIn: fail, expired: () => false })
  await store.load('member'); assert.equal(store.get('member').status, 'disabled'); assert.equal(store.get('member').summary, null)
})
test('a review refresh waits for an older read and then requests the updated summary', async () => {
  let reads = 0, release
  const earlier = new Promise(resolve => { release = resolve })
  const store = createGrowthStore({ enabled: true, read: () => ++reads === 1 ? earlier : Promise.resolve(summary(90)), checkIn: async () => summary(2), expired: () => false })
  const loading = store.load('member'), refreshing = store.refresh('member')
  release(summary(80)); await Promise.all([loading, refreshing])
  assert.equal(reads, 2); assert.equal(store.get('member').summary.totalXp, 90)
})
test('sign-out invalidation discards in-flight member data', async () => {
  let release
  const read = new Promise(resolve => { release = resolve })
  const store = createGrowthStore({ enabled: true, read: () => read, checkIn: async () => summary(2), expired: () => false })
  const loading = store.load('previous-member'); store.clear(); release(summary(990)); await loading
  assert.equal(store.get('previous-member').summary, null); assert.equal(store.get('next-member').summary, null)
})
test('read errors hide XP while check-in errors retain a verified summary and permit retry', async () => {
  let failRead = true, failCheckIn = true
  const store = createGrowthStore({ enabled: true, read: async () => { if (failRead) throw new Error('offline'); return summary(80, true) }, checkIn: async () => { if (failCheckIn) throw new Error('offline'); return summary(82) }, expired: () => false })
  await store.load('member'); assert.equal(store.get('member').status, 'error'); assert.equal(store.get('member').summary, null)
  failRead = false; await store.refresh('member'); assert.equal(store.get('member').summary.totalXp, 80); assert.equal(store.get('member').checkInError, true)
  failCheckIn = false; await store.refresh('member'); assert.equal(store.get('member').summary.totalXp, 82); assert.equal(store.get('member').checkInError, false)
})
