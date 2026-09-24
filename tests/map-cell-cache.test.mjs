import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchMapCellOrigin, invalidateMapCells, mapCellGlobalKey, mapCellObjectKey, readThroughMapCell,
  sanitizeMapCellOriginResponse } from '../src/server/mapCellCache.ts'

class FakeR2 {
  objects = new Map(); sequence = 0
  async get(key) {
    const found = this.objects.get(key)
    return found ? { etag: found.etag, json: async () => JSON.parse(found.value) } : null
  }
  async put(key, value, options = {}) {
    const current = this.objects.get(key), only = options.onlyIf
    if (only?.etagDoesNotMatch === '*' && current) return null
    if (only?.etagMatches && current?.etag !== only.etagMatches) return null
    const etag = `etag-${++this.sequence}`
    this.objects.set(key, { etag, value })
    return { etag }
  }
  value(key) { return JSON.parse(this.objects.get(key).value) }
}
const cell = { x: 2540, y: 750 }
const marker = (name, id = 1) => ({ id, name, latitude: 37.525, longitude: 127.025 })
const event = bounds => ({ toiletId: 1, revision: 1, action: 'UPSERT', catalogChanged: false,
  regionScopeComplete: true, regionBounds: bounds })

test('legacy map reads remain available when an older API rejects /map-cell', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async url => {
    calls.push(String(url))
    if (calls.length === 1) return { status: 400, ok: false }
    return { status: 200, ok: true, json: async () => ({ meta: { display_type: 'MARKER' },
      toilets: [marker('fallback', 17)] }) }
  }
  try {
    const result = await fetchMapCellOrigin(cell)
    assert.equal(result[0].name, 'fallback')
    assert.match(calls[0], /\/api\/v1\/toilets\/map-cell\?/)
    assert.match(calls[1], /\/api\/v1\/toilets\?/)
    assert.match(calls[1], /includeList=false/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('simultaneous cold readers cause one origin read and reuse a stable R2 key', async () => {
  const bucket = new FakeR2(); let originReads = 0
  const fetchOrigin = async () => { originReads++; await new Promise(resolve => setTimeout(resolve, 25)); return [marker('fresh')] }
  const results = await Promise.all(Array.from({ length: 18 }, () =>
    readThroughMapCell({ bucket, cell, fetchOrigin })))
  assert.equal(originReads, 1)
  assert.ok(results.every(result => result.toilets[0].name === 'fresh'))
  assert.equal(bucket.value(mapCellObjectKey(cell)).state, 'data')
  assert.equal(bucket.objects.size, 1)
})

test('a scoped edit invalidates the old map cell before a fresh read', async () => {
  const bucket = new FakeR2(); let value = 'before'; let originReads = 0
  const fetchOrigin = async () => { originReads++; return [marker(value)] }
  await readThroughMapCell({ bucket, cell, fetchOrigin })
  value = 'after'
  assert.equal(await invalidateMapCells(bucket, [event({ west: 127.025, east: 127.025,
    south: 37.525, north: 37.525 })]), 'scoped')
  assert.equal(bucket.value(mapCellObjectKey(cell)).state, 'invalidated')
  const updated = await readThroughMapCell({ bucket, cell, fetchOrigin })
  assert.equal(updated.toilets[0].name, 'after')
  assert.equal(originReads, 2)
  assert.equal(bucket.objects.size, 1)
})

test('unknown scope advances the global generation without per-deploy copies', async () => {
  const bucket = new FakeR2(); let value = 'old'
  const fetchOrigin = async () => [marker(value)]
  await readThroughMapCell({ bucket, cell, fetchOrigin })
  value = 'new'
  assert.equal(await invalidateMapCells(bucket, [{ ...event(null), regionScopeComplete: false }]), 'global')
  assert.equal(bucket.value(mapCellGlobalKey()).revision, 1)
  const current = await readThroughMapCell({ bucket, cell, fetchOrigin })
  assert.equal(current.toilets[0].name, 'new')
  assert.equal(bucket.objects.size, 2)
})

test('invalidation during refresh prevents a stale writer from restoring old data', async () => {
  const bucket = new FakeR2(); let reads = 0
  const result = await readThroughMapCell({ bucket, cell, fetchOrigin: async () => {
    reads++
    if (reads === 1) {
      await invalidateMapCells(bucket, [event({ west: 127.025, east: 127.025,
        south: 37.525, north: 37.525 })])
      return [marker('old')]
    }
    return [marker('new')]
  } })
  assert.equal(result.toilets[0].name, 'new')
  assert.equal(reads, 2)
})

test('global invalidation during a cold read retries with the new generation', async () => {
  const bucket = new FakeR2(); let reads = 0
  const result = await readThroughMapCell({ bucket, cell, fetchOrigin: async () => {
    reads++
    if (reads === 1) {
      await invalidateMapCells(bucket, [{ ...event(null), regionScopeComplete: false }])
      return [marker('old')]
    }
    return [marker('new')]
  } })
  assert.equal(result.toilets[0].name, 'new')
  assert.equal(reads, 2)
  assert.equal(bucket.value(mapCellObjectKey(cell)).globalRevision, 1)
})

test('failed refresh cannot serve stale data after a scoped invalidation', async () => {
  const bucket = new FakeR2(); let time = 1_000; let reads = 0
  await readThroughMapCell({ bucket, cell, now: () => time, fetchOrigin: async () => [marker('old')] })
  time += 31 * 24 * 60 * 60 * 1000
  const result = await readThroughMapCell({ bucket, cell, now: () => time, fetchOrigin: async () => {
    reads++
    if (reads === 1) {
      await invalidateMapCells(bucket, [event({ west: 127.025, east: 127.025,
        south: 37.525, north: 37.525 })], () => time)
      throw new Error('old refresh failed')
    }
    return [marker('new')]
  } })
  assert.equal(result.toilets[0].name, 'new')
  assert.equal(reads, 2)
})

test('the cached marker excludes addresses and unknown origin fields', () => {
  const input = { meta: { display_type: 'MARKER' }, toilets: [{ ...marker('한국어'),
    email: 'hidden@example.test', translations: { en: { name: 'Restroom', roadAddress: 'long address', secret: 'token' } },
    displayGroupTranslations: { en: 'Group', bad: 4 } }] }
  const [value] = sanitizeMapCellOriginResponse(input, cell)
  assert.equal(value.email, undefined)
  assert.deepEqual(value.translations, { en: { name: 'Restroom', roadAddress: null, jibunAddress: null } })
  assert.deepEqual(value.displayGroupTranslations, { en: 'Group' })
})

test('an API response with explicit zero counts and no toilet list is an empty cell', () => {
  const empty = { meta: { display_type: 'MARKER', total_count: 0, result_count: 0 } }
  assert.deepEqual(sanitizeMapCellOriginResponse(empty, cell), [])
  assert.throws(() => sanitizeMapCellOriginResponse({ ...empty,
    meta: { ...empty.meta, total_count: 1 } }, cell), /Invalid map cell origin response/)
})
