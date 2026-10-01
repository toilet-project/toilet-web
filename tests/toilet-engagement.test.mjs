import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createViewRecorder, createEngagementApi, decodeCounts, decodeLike, observeDetailView } from '../src/lib/toiletEngagement.ts'
import { decodeCrowding, crowdingLabel } from '../src/lib/reviewCrowding.ts'

const memory = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) } }
test('view receipts deduplicate refresh, language changes, concurrent mounts, and retry the same event after a lost response', async () => {
  const storage = memory(); let now = 1000, calls = [], fail = true
  const send = async (session, event) => { calls.push({ session, event }); if (fail) throw Error('lost response'); return { counted: true, counts: { toiletId: 42, views: 1, likes: 0 }, nextEligibleAt: new Date(now + 1800000).toISOString() } }
  let record = createViewRecorder(storage, randomUUID, () => now)
  await assert.rejects(record(42, send)); fail = false
  record = createViewRecorder(storage, randomUUID, () => now)
  await Promise.all([record(42, send), record(42, send)])
  assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1])
  record = createViewRecorder(storage, randomUUID, () => now)
  assert.equal(await record(42, send), null)
  now += 1800000; await record(42, send)
  assert.notEqual(calls[2].event, calls[0].event); assert.equal(calls[2].session, calls[0].session)
})
test('unavailable browser storage still has in-memory deduplication', async () => {
  const record = createViewRecorder({ getItem() { throw Error() }, setItem() { throw Error() } }, randomUUID, () => 1000)
  let calls = 0
  const send = async () => { calls++; return { nextEligibleAt: new Date(1801000).toISOString() } }
  await record(1, send); await record(1, send); assert.equal(calls, 1)
})
test('view requests omit credentials and personal fields; likes send desired state to an authenticated endpoint', async () => {
  const calls = [], counts = { toiletId: 42, views: 5, likes: 2 }
  const request = async (url, init) => { calls.push({ url, init }); return Response.json(url.endsWith('/views') ? { counted: true, counts, nextEligibleAt: null } : { toiletId: 42, liked: init.method === 'PUT', likes: 2 }) }
  const api = createEngagementApi('https://example.test', request, request)
  const session = randomUUID(), event = randomUUID()
  await api.view(42, session, event); await api.setLike(42, true); await api.setLike(42, false)
  assert.equal(calls[0].init.credentials, 'omit'); assert.equal(calls[0].init.keepalive, true)
  assert.deepEqual(JSON.parse(calls[0].init.body), { sessionId: session, eventId: event })
  assert.deepEqual(calls.slice(1).map(c => c.init.method), ['PUT', 'DELETE'])
  for (const c of calls) assert.equal(c.init.cache, 'no-store')
  assert.equal(calls[1].init.credentials, 'include')
  assert.throws(() => decodeCounts({ ...counts, toiletId: 43 }, 42)); assert.throws(() => decodeLike({ toiletId: 42, liked: 'true', likes: 2 }, 42))
  await assert.rejects(api.view(-1, session, event)); assert.equal(calls.length, 3)
})
test('visible detail requires a continuous foreground second and cancels after unmount', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const saved = { document: globalThis.document, IntersectionObserver: globalThis.IntersectionObserver }
  let changed, intersect, seen = 0, disconnected = false
  globalThis.document = { visibilityState: 'visible', addEventListener: (_, f) => { changed = f }, removeEventListener() {} }
  globalThis.IntersectionObserver = class { constructor(cb) { intersect = cb } observe() {} disconnect() { disconnected = true } }
  try {
    const stop = observeDetailView({}, () => seen++)
    intersect([{ isIntersecting: true, intersectionRatio: 1 }]); t.mock.timers.tick(600)
    document.visibilityState = 'hidden'; changed(); t.mock.timers.tick(1500); assert.equal(seen, 0)
    document.visibilityState = 'visible'; changed(); t.mock.timers.tick(999); assert.equal(seen, 0)
    t.mock.timers.tick(1); assert.equal(seen, 1); t.mock.timers.tick(60000); assert.equal(seen, 1)
    stop(); assert.equal(disconnected, true)
  } finally { Object.assign(globalThis, saved) }
})
test('crowding labels use the average bucket and explain sample period in every supported locale', () => {
  const sample = { status: 'WAIT', waitLowerBound: 15, sampleCount: 3, zeroWaitCount: 0, averageWaitMinutes: 16.7, windowDays: 7, latestReviewAt: '2026-10-01T10:00:00+09:00' }
  assert.equal(crowdingLabel(decodeCrowding(sample), 'ko'), '15분 이상')
  for (const locale of ['ko','en','ja','zh-CN','zh-TW','zh-HK']) assert.ok(crowdingLabel(sample, locale).includes('15'))
  assert.equal(crowdingLabel({ ...sample, status: 'CLEAR', waitLowerBound: 0 }, 'ko'), '원활')
  assert.throws(() => decodeCrowding({ ...sample, sampleCount: 0 })); assert.throws(() => decodeCrowding({ ...sample, waitLowerBound: 12 }))
})
