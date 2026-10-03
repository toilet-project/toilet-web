import assert from 'node:assert/strict'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'
import { createHmac } from 'node:crypto'
import { invalidateMapCells, mapCellObjectKey, readThroughMapCell } from '../src/server/mapCellCache.ts'
import { fetchMapFilterSourceOrigin, invalidateMapFilterSource, mapFilterCellBucket, mapFilterPreviewEnabled,
  MAP_FILTER_PREVIEW_SOURCE_KEY, mapFilterSourceKey, readPreviewMapFilterSource,
  readThroughFilterCell, readThroughMapFilterSource } from '../src/server/mapFilterCache.ts'
import { readMapFilterArea } from '../src/server/mapFilterArea.ts'

class FakeR2 {
  objects = new Map(); sequence = 0; reads = 0
  async get(key) {
    this.reads++
    const found = this.objects.get(key)
    if (!found) return null
    // R2's etag may be inherited/getter-backed rather than an enumerable own property.
    return Object.create({ get etag() { return found.etag },
      json: async () => JSON.parse(Buffer.from(found.value).toString()),
      arrayBuffer: async () => Buffer.from(found.value).buffer.slice(Buffer.from(found.value).byteOffset,
        Buffer.from(found.value).byteOffset + Buffer.from(found.value).byteLength) }, {
      arrayBuffer: { value: async () => { const bytes = Buffer.from(found.value); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } },
    })
  }
  async head(key) { const found = this.objects.get(key); return found ? { etag: found.etag } : null }
  async put(key, value, options = {}) {
    const current = this.objects.get(key), only = options.onlyIf
    if (only?.etagDoesNotMatch === '*' && current) return null
    if (only?.etagMatches && current?.etag !== only.etagMatches) return null
    const etag = `etag-${++this.sequence}`
    this.objects.set(key, { etag, value: Buffer.from(value) })
    return { etag }
  }
  value(key) { const bytes = this.objects.get(key).value; return JSON.parse((key.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString()) }
}
const cell = { x: 2540, y: 750 }
const marker = (flags = 31) => ({ id: 1, name: 'real source fixture', latitude: 37.525, longitude: 127.025, filterFlags: flags })
const points = [[1, 37.525, 127.025, 31], [2, 37.55, 127.06, 1]]
const input = { bounds: { south: 37.51, north: 37.54, west: 127.01, east: 127.04 }, zoom: 8, includeList: true, filterFlags: 1 }
const event = { toiletId: 1, revision: 2, action: 'UPSERT', catalogChanged: false, regionScopeComplete: true,
  regionBounds: { south: 37.525, north: 37.525, west: 127.025, east: 127.025 } }

test('five-condition cells use v3 and preserve both unfiltered v1 and old four-condition v2', async () => {
  const bucket = new FakeR2()
  await readThroughMapCell({ bucket, cell, fetchOrigin: async () => [{ ...marker(), name: 'original' }] })
  const original = Buffer.from(bucket.objects.get(mapCellObjectKey(cell)).value)
  await bucket.put('map-cells/v2/cells/750/2540.json', JSON.stringify({ data: [marker(15)] }))
  const previousFilters = Buffer.from(bucket.objects.get('map-cells/v2/cells/750/2540.json').value)
  let reads = 0
  const fetchOrigin = async () => { reads++; return [marker()] }
  await Promise.all(Array.from({ length: 10 }, () => readThroughFilterCell({ bucket, cell, fetchOrigin })))
  assert.equal(reads, 1)
  await invalidateMapCells(mapFilterCellBucket(bucket), [event])
  await readThroughFilterCell({ bucket, cell, fetchOrigin })
  assert.equal(reads, 2)
  assert.deepEqual(bucket.objects.get(mapCellObjectKey(cell)).value, original)
  assert.deepEqual(bucket.objects.get('map-cells/v2/cells/750/2540.json').value, previousFilters)
  assert.equal(bucket.value('map-cells/v3/cells/750/2540.json').data[0].filterFlags, 31)
})

test('preview snapshot replacement forces v3 refill instead of retaining old flags', async () => {
  const bucket = new FakeR2(); let reads = 0
  const read = (date, flags) => readThroughFilterCell({ bucket, cell, previewSourceDate: date,
    fetchOrigin: async () => { reads++; return [marker(flags)] } })
  await read('2026-10-03T02:00:00Z', 1)
  assert.equal((await read('2026-10-03T02:00:00Z', 15)).toilets[0].filterFlags, 1)
  assert.equal((await read('2026-10-03T03:00:00Z', 15)).toilets[0].filterFlags, 15)
  assert.equal(reads, 2)
})

test('national source has one lease, one unfiltered object and no personal/filter-combination keys', async () => {
  const bucket = new FakeR2(); let reads = 0
  const fetchOrigin = async () => { reads++; await new Promise(resolve => setTimeout(resolve, 20)); return points }
  const results = await Promise.all(Array.from({ length: 10 }, () => readThroughMapFilterSource({ bucket, fetchOrigin })))
  assert.equal(reads, 1)
  assert.ok(results.every(result => result.points.length === 2))
  assert.deepEqual([...bucket.objects.keys()], [mapFilterSourceKey()])
  assert.deepEqual(bucket.value(mapFilterSourceKey()).points, points)
})

test('national invalidation wins against an in-flight old source writer', async () => {
  const bucket = new FakeR2(); let reads = 0
  const result = await readThroughMapFilterSource({ bucket, fetchOrigin: async () => {
    reads++
    if (reads === 1) { await invalidateMapFilterSource(bucket); return points }
    return [points[1]]
  } })
  assert.equal(reads, 2)
  assert.deepEqual(result.points, [points[1]])
})

test('national failure uses bounded retry, never falls back to unfiltered origin', async () => {
  const bucket = new FakeR2(); let reads = 0
  const fetchOrigin = async () => { reads++; throw new Error('offline') }
  await assert.rejects(readThroughMapFilterSource({ bucket, fetchOrigin }), /offline/)
  await assert.rejects(readThroughMapFilterSource({ bucket, fetchOrigin }), /retry deferred/)
  assert.equal(reads, 1)
})

test('filter source signing binds the new exact API path and rejects missing contract', async () => {
  const previous = process.env.CACHE_REVALIDATION_SECRET, fetch = globalThis.fetch
  process.env.CACHE_REVALIDATION_SECRET = 'test-not-a-real-secret'.repeat(3)
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /\/api\/v1\/toilets\/map-filter-points$/)
    const timestamp = options.headers['X-Map-Cluster-Timestamp']
    assert.equal(options.headers['X-Map-Cluster-Signature'], createHmac('sha256', process.env.CACHE_REVALIDATION_SECRET)
      .update(`v1\nGET\n/api/v1/toilets/map-filter-points\n${timestamp}`).digest('hex'))
    assert.equal(options.cache, 'no-store')
    return Response.json(points)
  }
  try { assert.deepEqual(await fetchMapFilterSourceOrigin(), points) }
  finally { globalThis.fetch = fetch; if (previous === undefined) delete process.env.CACHE_REVALIDATION_SECRET; else process.env.CACHE_REVALIDATION_SECRET = previous }
})

test('preview real snapshot feeds markers and clusters with no detail N+1 or production writes', async () => {
  const previous = { source: process.env.MAP_FILTER_PREVIEW_SOURCE_ENABLED, indexable: process.env.SITE_INDEXABLE }
  const fetch = globalThis.fetch
  process.env.MAP_FILTER_PREVIEW_SOURCE_ENABLED = 'true'; process.env.SITE_INDEXABLE = 'false'
  const bucket = new FakeR2(); const calls = []
  const exportedAt = '2026-10-03T03:00:00Z'
  await bucket.put(MAP_FILTER_PREVIEW_SOURCE_KEY, JSON.stringify({ schema: 2, exportedAt, points }))
  globalThis.fetch = async url => {
    calls.push(String(url))
    assert.match(String(url), /\/api\/v1\/toilets\/map-cell\?/)
    return Response.json({ meta: { display_type: 'MARKER', total_count: 1, result_count: 1 }, toilets: [{ ...marker(), filterFlags: undefined }] })
  }
  try {
    const first = await readMapFilterArea(bucket, { ...input, likedIds: [1] })
    assert.equal(first.response.meta.total_count, 1)
    assert.equal(first.response.toilets[0].filterFlags, 31)
    assert.equal(first.sourceDate, exportedAt)
    const second = await readMapFilterArea(bucket, { ...input, filterFlags: 15 })
    assert.equal(second.originReads, 0)
    assert.equal(calls.length, 1)
    const clusters = await readMapFilterArea(bucket, { ...input, includeList: false, zoom: 12, filterFlags: 15 })
    assert.equal(clusters.response.meta.total_count, 1)
    for (const zoom of [7, 8, 9]) for (const includeList of [false, true]) {
      const wide = await readMapFilterArea(bucket, { bounds: { south: 36.8, north: 37.8, west: 126, east: 127.5 },
        zoom, includeList, filterFlags: 1 })
      assert.equal(wide.response.meta.display_type, 'CLUSTER')
      assert.equal(wide.response.meta.map_level, zoom)
      assert.equal(wide.response.meta.total_count, 2)
      assert.equal(wide.response.clusters.reduce((total, cluster) => total + cluster.count, 0), 2)
      assert.equal(wide.originReads, 0)
      assert.deepEqual(wide.response.toilets, [])
    }
    assert.equal(calls.length, 1, 'wide viewports never fan out full marker or cell calls')
    const readCount = bucket.reads
    assert.equal((await readMapFilterArea(bucket, { ...input, likedIds: [] })).response.meta.total_count, 0)
    assert.equal(bucket.reads, readCount)
    assert.deepEqual([...bucket.objects.keys()].sort(), ['map-cells/v3/cells/750/2540.json', MAP_FILTER_PREVIEW_SOURCE_KEY].sort())
    assert.ok(!JSON.stringify(bucket.value('map-cells/v3/cells/750/2540.json')).includes('likedIds'))
    process.env.SITE_INDEXABLE = 'true'
    assert.throws(mapFilterPreviewEnabled, /not allowed/)
    await assert.rejects(readPreviewMapFilterSource(bucket), /not allowed/)
  } finally {
    globalThis.fetch = fetch
    for (const [key, value] of [['MAP_FILTER_PREVIEW_SOURCE_ENABLED', previous.source], ['SITE_INDEXABLE', previous.indexable]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  }
})

test('old preview snapshot schema fails closed even if all its flags are numerically valid', async () => {
  const previous = { source: process.env.MAP_FILTER_PREVIEW_SOURCE_ENABLED, indexable: process.env.SITE_INDEXABLE }
  process.env.MAP_FILTER_PREVIEW_SOURCE_ENABLED = 'true'; process.env.SITE_INDEXABLE = 'false'
  try {
    const bucket = new FakeR2()
    await bucket.put(MAP_FILTER_PREVIEW_SOURCE_KEY, JSON.stringify({ schema: 1, exportedAt: '2026-10-03T03:00:00Z', points }))
    await assert.rejects(readPreviewMapFilterSource(bucket), /Invalid preview filter snapshot/)
  } finally {
    for (const [key, value] of [['MAP_FILTER_PREVIEW_SOURCE_ENABLED', previous.source], ['SITE_INDEXABLE', previous.indexable]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  }
})
