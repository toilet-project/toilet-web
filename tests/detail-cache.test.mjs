import assert from 'node:assert/strict'
import test from 'node:test'
import { createDetailCache } from '../src/lib/detailCache.ts'

test('details expire without extending freshness on read', () => {
  let now = 0
  const cache = createDetailCache(30, 2, () => now)
  cache.set({id: 1, name: '첫 화장실'})
  now = 29
  assert.equal(cache.get(1).name, '첫 화장실')
  now = 30
  assert.equal(cache.get(1), null)
})
test('cache is bounded, isolated by ID, and replaces refreshed entries', () => {
  const cache = createDetailCache(30, 2, () => 0)
  cache.set({id: 1, name: '첫 화장실'})
  cache.set({id: 2, name: '두 번째'})
  cache.set({id: 1, name: '최신'})
  cache.set({id: 3, name: '세 번째'})
  assert.equal(cache.get(1).name, '최신')
  assert.equal(cache.get(2), null)
  assert.equal(cache.get(3).name, '세 번째')
})
