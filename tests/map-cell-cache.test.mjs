import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchMapCellOrigin, invalidateMapCells, mapCellGlobalKey, mapCellObjectKey, readThroughMapCell,
  readThroughMapCells, sanitizeMapCellOriginResponse } from '../src/server/mapCellCache.ts'

class FakeR2 {
  objects = new Map(); sequence = 0; readKeys = []
  async get(key) {
    this.readKeys.push(key)
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
const viewportCells = [cell, { ...cell, x: cell.x + 1 }, { ...cell, y: cell.y + 1 }, { x: cell.x + 1, y: cell.y + 1 }]

test('a warm four-cell viewport shares two generation reads without sharing results between requests', async () => {
  const bucket = new FakeR2()
  const fetchOrigin = async cell => [marker(`cell-${cell.x}-${cell.y}`)]
  await readThroughMapCells({ bucket, cells: viewportCells, fetchOrigin })
  bucket.readKeys = []
  const first = await readThroughMapCells({ bucket, cells: viewportCells,
    fetchOrigin: async () => { throw new Error('warm viewport must not read origin') } })
  assert.deepEqual(first.map(result => result.source), ['hit', 'hit', 'hit', 'hit'])
  assert.deepEqual(first.map(result => result.toilets[0].name), viewportCells.map(cell => `cell-${cell.x}-${cell.y}`))
  assert.equal(bucket.readKeys.length, 6)
  assert.equal(bucket.readKeys.filter(key => key === mapCellGlobalKey()).length, 2)
  bucket.readKeys = []
  await readThroughMapCells({ bucket, cells: viewportCells, fetchOrigin })
  assert.equal(bucket.readKeys.length, 6, 'each viewport checks the current persisted generation again')
})

test('a global invalidation during a warm viewport reloads every cell before returning', async () => {
  const bucket = new FakeR2()
  await readThroughMapCells({ bucket, cells: viewportCells, fetchOrigin: async () => [marker('old')] })
  const get = bucket.get.bind(bucket); let invalidated = false; let originReads = 0
  bucket.get = async key => {
    const object = await get(key)
    if (key !== mapCellObjectKey(cell) || invalidated) return object
    return { ...object, json: async () => {
      const value = await object.json()
      invalidated = true
      await invalidateMapCells(bucket, [{ ...event(null), regionScopeComplete: false }])
      return value
    } }
  }
  const results = await readThroughMapCells({ bucket, cells: viewportCells,
    fetchOrigin: async () => { originReads++; return [marker('new')] } })
  assert.ok(results.every(result => result.toilets[0].name === 'new'))
  assert.equal(originReads, 4)
  assert.ok(viewportCells.every(cell => bucket.value(mapCellObjectKey(cell)).globalRevision === 1))
})

test('parallel reads reject old cells even when the initial generation finishes after their bodies', async () => {
  const bucket = new FakeR2()
  await readThroughMapCells({ bucket, cells: viewportCells, fetchOrigin: async () => [marker('old')] })
  const get = bucket.get.bind(bucket)
  let releaseGeneration
  const afterBody = new Promise(resolve => { releaseGeneration = resolve })
  let waitForBody = true; let bodyRead = false
  bucket.get = async key => {
    if (key === mapCellGlobalKey() && waitForBody) {
      waitForBody = false
      await afterBody
    }
    const object = await get(key)
    if (key !== mapCellObjectKey(cell) || bodyRead) return object
    return { ...object, json: async () => {
      const value = await object.json()
      bodyRead = true
      await invalidateMapCells(bucket, [{ ...event(null), regionScopeComplete: false }])
      releaseGeneration()
      return value
    } }
  }
  const results = await readThroughMapCells({ bucket, cells: viewportCells, fetchOrigin: async () => [marker('new')] })
  assert.ok(results.every(result => result.toilets[0].name === 'new'))
})

test('a scoped deletion refills only its cell and does not resurrect a removed marker', async () => {
  const bucket = new FakeR2(); let originReads = 0
  await readThroughMapCells({ bucket, cells: viewportCells, fetchOrigin: async () => [marker('visible')] })
  await invalidateMapCells(bucket, [event({ west: 127.025, east: 127.025, south: 37.525, north: 37.525 })])
  const results = await readThroughMapCells({ bucket, cells: viewportCells,
    fetchOrigin: async () => { originReads++; return [] } })
  assert.equal(originReads, 1)
  assert.deepEqual(results[0], { toilets: [], source: 'miss' })
  assert.ok(results.slice(1).every(result => result.source === 'hit'))
})

test('a scoped invalidation during a batched cold fetch defeats the old lease writer', async () => {
  const bucket = new FakeR2(); let targetedReads = 0
  const results = await readThroughMapCells({ bucket, cells: viewportCells, fetchOrigin: async current => {
    if (current.x !== cell.x || current.y !== cell.y) return [marker('unchanged')]
    if (++targetedReads === 1) {
      await invalidateMapCells(bucket, [event({ west: 127.025, east: 127.025, south: 37.525, north: 37.525 })])
      return [marker('removed')]
    }
    return []
  } })
  assert.equal(targetedReads, 2)
  assert.deepEqual(results[0].toilets, [])
})

test('a global invalidation during a batched cold fetch cannot mix old and new generations', async () => {
  const bucket = new FakeR2(); let invalidated = false
  const results = await readThroughMapCells({ bucket, cells: viewportCells, fetchOrigin: async () => {
    if (!invalidated) {
      invalidated = true
      await invalidateMapCells(bucket, [{ ...event(null), regionScopeComplete: false }])
      return [marker('old')]
    }
    return [marker('new')]
  } })
  assert.ok(results.every(result => result.toilets[0].name === 'new'))
  assert.ok(viewportCells.every(cell => bucket.value(mapCellObjectKey(cell)).globalRevision === 1))
})

test('simultaneous batched cold viewports keep one origin lease per cell', async () => {
  const bucket = new FakeR2(); const reads = new Map()
  const fetchOrigin = async cell => {
    const key = mapCellObjectKey(cell)
    reads.set(key, (reads.get(key) ?? 0) + 1)
    await new Promise(resolve => setTimeout(resolve, 20))
    return [marker('fresh')]
  }
  const results = await Promise.all(Array.from({ length: 8 }, () => readThroughMapCells({ bucket, cells: viewportCells, fetchOrigin })))
  assert.equal(reads.size, 4)
  assert.ok([...reads.values()].every(reads => reads === 1))
  assert.ok(results.flat().every(result => result.toilets[0].name === 'fresh'))
})

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
