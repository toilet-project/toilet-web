import assert from 'node:assert/strict'
import test from 'node:test'
import { POST } from '../src/app/api/map-source-cells/route.ts'
import { cellBounds, cellsForBounds } from '../src/lib/mapCells.ts'
import { invalidateMapCells, readThroughMapCells } from '../src/server/mapCellCache.ts'
import { MAP_FILTER_PREVIEW_SOURCE_KEY, invalidateMapFilterCaches, readThroughFilterCells } from '../src/server/mapFilterCache.ts'
import { mapSourceCellBucket, parseMapSourceCellsInput, readMapSourceCells } from '../src/server/mapSourceCells.ts'

class FakeR2 {
  objects = new Map(); sequence = 0
  async get(key) {
    const found = this.objects.get(key)
    return found ? { etag: found.etag, json: async () => JSON.parse(found.value) } : null
  }
  async put(key, value, options = {}) {
    const found = this.objects.get(key), only = options.onlyIf
    if (only?.etagDoesNotMatch === '*' && found) return null
    if (only?.etagMatches && only.etagMatches !== found?.etag) return null
    const etag = `etag-${++this.sequence}`
    this.objects.set(key, { etag, value })
    return { etag }
  }
}
const cell = { x: 2540, y: 750 }
const marker = (id = 1, filterFlags = 127) => ({ id, name: `public-${id}`, latitude: 37.525,
  longitude: 127.025, filterSchema: 3, filterFlags })
const facts = markers => markers.map(({ id, name, latitude, longitude, filterSchema, filterFlags }) =>
  ({ id, name, latitude, longitude, filterSchema, filterFlags }))
const event = { toiletId: 1, revision: 2, action: 'UPSERT', catalogChanged: false, regionScopeComplete: true,
  regionBounds: { south: 37.525, north: 37.525, west: 127.025, east: 127.025 } }

test('source accepts bounded exact public cell identities, including country edge cells', () => {
  const cells = [{ x: 2480, y: 640 }, { x: 2639, y: 799 }, cell]
  assert.deepEqual(parseMapSourceCellsInput({ cells }), cells)
  for (const invalid of [null, [], {}, { cells: [] }, { cells: [cell, cell] },
    { cells: [cell], likedIds: [1] }, { cells: [cell], filterFlags: 1 },
    { cells: [null] }, { cells: [{ ...cell, x: '2540' }] }, { cells: [{ ...cell, x: 2540.5 }] },
    { cells: [{ ...cell, private: true }] }, { cells: [{ x: 2479, y: 640 }] },
    { cells: [{ x: 2640, y: 799 }] }, { cells: [{ x: 2480, y: 639 }] },
    { cells: [{ x: 2480, y: 800 }] }, { cells: Array.from({ length: 17 }, (_, index) => ({ x: 2500 + index, y: 750 })) }])
    assert.equal(parseMapSourceCellsInput(invalid), null)
})

test('source returns complete inclusive cells for later filters, stripping unknown warm-cache fields', async () => {
  const bucket = new FakeR2()
  const cells = cellsForBounds({ south: 37.51, north: 37.55, west: 127.01, east: 127.05 })
  const sharedBoundary = { ...marker(2, 0), latitude: 37.55, longitude: 127.05,
    email: 'private@example.test', likedIds: [1], translations: { en: { name: 'Restroom', secret: 'hidden' } } }
  await readThroughMapCells({ bucket: mapSourceCellBucket(bucket), cells, fetchOrigin: async () => [sharedBoundary] })
  const result = await readMapSourceCells(bucket, cells)
  assert.equal(result.response.schema, 3)
  assert.deepEqual(result.response.cells.map(item => item.cell), cells)
  assert.equal(result.originReads, 0)
  for (const item of result.response.cells) {
    assert.equal(item.toilets.length, 1)
    assert.equal(item.toilets[0].filterFlags, 0, 'unmatched markers must still be reusable by a later filter')
    assert.equal(item.toilets[0].filterSchema, 3)
    assert.equal(item.toilets[0].email, undefined)
    assert.equal(item.toilets[0].likedIds, undefined)
    assert.deepEqual(item.toilets[0].translations, { en: { name: 'Restroom', roadAddress: null, jibunAddress: null } })
  }
})

test('cold source limits origin concurrency to four and uses only its complete-source namespace', async () => {
  const bucket = new FakeR2()
  const cells = Array.from({ length: 8 }, (_, index) => ({ x: 2540 + index, y: 750 }))
  const originalFetch = globalThis.fetch
  let active = 0, maximum = 0, calls = 0
  globalThis.fetch = async url => {
    const query = new URL(url).searchParams
    active++; maximum = Math.max(maximum, active); calls++
    await new Promise(resolve => setTimeout(resolve, 5))
    active--
    return Response.json({ meta: { display_type: 'MARKER', total_count: 1, result_count: 1 },
      toilets: [{ ...marker(calls), longitude: Number(query.get('westLng')) + 0.025 }] })
  }
  try {
    const result = await readMapSourceCells(bucket, cells)
    assert.equal(result.response.cells.length, 8)
    assert.equal(result.originReads, 8)
    assert.equal(maximum, 4)
    assert.equal((await readMapSourceCells(bucket, cells)).originReads, 0)
    assert.equal(calls, 8)
    assert.ok([...bucket.objects.keys()].every(key => key.startsWith('map-source-cells/v1/')))
  } finally { globalThis.fetch = originalFetch }
})

test('source respects scoped deletion and refuses malformed coordinates or incomplete schema', async () => {
  const bucket = new FakeR2()
  const originalFetch = globalThis.fetch
  await readThroughMapCells({ bucket: mapSourceCellBucket(bucket), cells: [cell], fetchOrigin: async () => [marker()] })
  await invalidateMapCells(mapSourceCellBucket(bucket), [event])
  globalThis.fetch = async () => Response.json({ meta: { display_type: 'MARKER', total_count: 0, result_count: 0 } })
  try {
    assert.deepEqual((await readMapSourceCells(bucket, [cell])).response.cells[0].toilets, [])
    for (const bad of [{ ...marker(), filterSchema: undefined }, { ...marker(), longitude: cellBounds(cell).east + 1 }]) {
      const fresh = new FakeR2()
      globalThis.fetch = async () => Response.json({ meta: { display_type: 'MARKER', total_count: 1 }, toilets: [bad] })
      await assert.rejects(readMapSourceCells(fresh, [cell]))
    }
  } finally { globalThis.fetch = originalFetch }
})

test('complete source includes new and moved live API markers independently of old preview filters', async () => {
  const previousSource = process.env.MAP_FILTER_PREVIEW_SOURCE_ENABLED
  const previousIndexable = process.env.SITE_INDEXABLE
  const originalFetch = globalThis.fetch
  process.env.MAP_FILTER_PREVIEW_SOURCE_ENABLED = 'true'; process.env.SITE_INDEXABLE = 'false'
  const bucket = new FakeR2(), exportedAt = '2026-10-20T00:00:00Z'
  let calls = 0
  const liveMarkers = [marker(), marker(2), { ...marker(3), latitude: 37.526 }, marker(53600, 0)]
  globalThis.fetch = async () => {
    calls++
    return Response.json({ meta: { display_type: 'MARKER', total_count: liveMarkers.length, result_count: liveMarkers.length },
      toilets: liveMarkers })
  }
  try {
    await bucket.put(MAP_FILTER_PREVIEW_SOURCE_KEY, JSON.stringify({ schema: 3, exportedAt,
      points: [[1, 37.525, 127.025, 1], [3, 37.525, 127.025, 1], [4, 37.525, 127.025, 1]] }))
    await readThroughFilterCells({ bucket, cells: [cell], previewSourceDate: 'older-snapshot',
      fetchOrigin: async () => [{ ...marker(), filterFlags: 1 }] })
    const filterBefore = bucket.objects.get('map-cells/v4/cells/750/2540.json').value
    const first = await readMapSourceCells(bucket, [cell])
    assert.deepEqual(facts(first.response.cells[0].toilets), liveMarkers, 'complete source must exactly match current public API facts')
    assert.deepEqual(first.response.cells[0].toilets.map(item => item.id), [1, 2, 3, 53600])
    assert.equal(first.response.cells[0].toilets[0].filterFlags, 127)
    await bucket.put(MAP_FILTER_PREVIEW_SOURCE_KEY, JSON.stringify({ schema: 3, exportedAt,
      points: [[1, 37.525, 127.025, 127]] }))
    assert.deepEqual(facts((await readMapSourceCells(bucket, [cell])).response.cells[0].toilets), liveMarkers)
    assert.equal(calls, 1, 'preview snapshot replacement must not change the complete API namespace')
    liveMarkers.splice(0, 1)
    await invalidateMapFilterCaches(bucket, [event])
    assert.deepEqual(facts((await readMapSourceCells(bucket, [cell])).response.cells[0].toilets), liveMarkers)
    assert.equal(calls, 2, 'preview invalidation must still refresh complete source cells after a deletion')
    assert.equal(bucket.objects.get('map-cells/v4/cells/750/2540.json').value, filterBefore,
      'preview enriched filter cells retain their existing invalidation policy')
  } finally {
    globalThis.fetch = originalFetch
    if (previousSource === undefined) delete process.env.MAP_FILTER_PREVIEW_SOURCE_ENABLED
    else process.env.MAP_FILTER_PREVIEW_SOURCE_ENABLED = previousSource
    if (previousIndexable === undefined) delete process.env.SITE_INDEXABLE
    else process.env.SITE_INDEXABLE = previousIndexable
  }
})

test('source route rejects private inputs, invalid origins and bounded/streaming bad bodies without caching', async () => {
  const previous = process.env.MAP_FILTERS_ENABLED, previousRuntime = process.env.CACHE_RUNTIME
  const send = (body, headers = {}) => POST(new Request('https://preview.geupddong.com/api/map-source-cells', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  }))
  try {
    process.env.MAP_FILTERS_ENABLED = 'false'
    assert.equal((await send({ cells: [cell] })).status, 404)
    process.env.MAP_FILTERS_ENABLED = 'true'; process.env.CACHE_RUNTIME = 'none'
    for (const extra of [{ Origin: 'https://attacker.example' }, { 'Sec-Fetch-Site': 'cross-site' }])
      assert.equal((await send({ cells: [cell] }, extra)).status, 403)
    for (const [body, headers] of [[{ cells: [cell], likedIds: [1] }, {}], [{ cells: [cell] }, { 'Content-Type': 'application/jsonp' }],
      [{ cells: [cell] }, { 'Content-Length': '-1' }], [{ cells: [cell] }, { 'Content-Length': '4097' }],
      [{ cells: [cell], large: 'x'.repeat(4097) }, {}]]) {
      const response = await send(body, headers)
      assert.equal(response.status, 400)
      assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
    }
    assert.equal((await send({ cells: [cell] }, { Origin: 'https://preview.geupddong.com' })).status, 503)
  } finally {
    if (previous === undefined) delete process.env.MAP_FILTERS_ENABLED; else process.env.MAP_FILTERS_ENABLED = previous
    if (previousRuntime === undefined) delete process.env.CACHE_RUNTIME; else process.env.CACHE_RUNTIME = previousRuntime
  }
})
