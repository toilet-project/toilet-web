import test from 'node:test'
import assert from 'node:assert/strict'
import { createListReviewCache } from '../src/lib/listReviewCache.ts'
const tick = () => new Promise(resolve => setImmediate(resolve))
const value = { count: 2, rating: 4, averageRating: 4, paperPercent: null, paperSampleCount: 0, latestWaitMinutes: null, latestWaitAt: null }

test('visible row requests are deduplicated and limited to three at a time', async () => {
  const started = [], finish = new Map()
  const cache = createListReviewCache(id => { started.push(id); return new Promise(resolve => finish.set(id, resolve)) })
  const requests = [1, 2, 3, 4].map(id => cache.get(id))
  assert.equal(cache.get(1), requests[0])
  await tick()
  assert.deepEqual(started, [1, 2, 3])
  finish.get(1)(value)
  await tick()
  assert.deepEqual(started, [1, 2, 3, 4])
  for (const id of [2, 3, 4]) finish.get(id)(value)
  await Promise.all(requests)
  assert.deepEqual(await cache.get(1), value)
  assert.equal(started.length, 4)
})

test('expired results refresh and failed reads are not cached as zero reviews', async () => {
  let now = 0, calls = 0
  const cache = createListReviewCache(async () => { calls++; if (calls === 1) throw new Error('offline'); return value }, () => now)
  await assert.rejects(cache.get(1), /offline/)
  await tick()
  assert.deepEqual(await cache.get(1), value)
  await tick()
  now = 59999
  await cache.get(1)
  assert.equal(calls, 2)
  now = 60001
  await cache.get(1)
  assert.equal(calls, 3)
})
