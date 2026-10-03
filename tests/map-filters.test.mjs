import assert from 'node:assert/strict'
import test from 'node:test'
import { enrichPreviewFilterMarkers, filterMapClusters, filterMapMarkers, matchesMapFilters,
  parseMapFilterInput, sanitizeMapFilterPoints } from '../src/lib/mapFilters.ts'
import { POST } from '../src/app/api/map-filter-area/route.ts'

const bounds = { south: 37.5, north: 37.6, west: 127, east: 127.1 }
const input = { bounds, zoom: 8, includeList: true, filterFlags: 0 }
const points = Array.from({ length: 32 }, (_, flags) => [flags + 1, 37.55, 127.05, flags])
const markers = points.map(([id, latitude, longitude, filterFlags]) =>
  ({ id, latitude, longitude, filterFlags, name: `facility${id}`, displayGroupId: 7 }))

test('all 32 AND combinations produce the same marker, cluster and viewport count before grouping', () => {
  for (let mask = 0; mask < 32; mask++) {
    const expected = markers.filter(marker => (marker.filterFlags & mask) === mask).map(marker => marker.id)
    const filtered = filterMapMarkers([...markers, markers[0]], { ...input, filterFlags: mask })
    assert.deepEqual(filtered.toilets.map(marker => marker.id), expected)
    assert.equal(filtered.meta.total_count, expected.length)
    for (let zoom = 7; zoom <= 14; zoom++) {
      const clustered = filterMapClusters(points, { ...input, zoom, filterFlags: mask })
      assert.equal(clustered.meta.total_count, expected.length)
      assert.equal(clustered.clusters.reduce((sum, item) => sum + item.count, 0), expected.length)
    }
  }
})

test('unknown attributes cannot satisfy a positive filter and partial group members do not gain attributes', () => {
  assert.equal(matchesMapFilters(undefined, 0), true)
  for (const value of [undefined, null, true, '31', -1, 32, 2.5]) assert.equal(matchesMapFilters(value, 1), false)
  const result = filterMapMarkers([{ ...markers[0], filterFlags: undefined }, markers[1], markers[2]],
    { ...input, filterFlags: 3 })
  assert.equal(result.meta.total_count, 0)
})

test('empty/private selection and exact bounds work at both zooms', () => {
  for (const likedIds of [[], [2], [2, 4, 99999]]) {
    const selected = markers.filter(marker => likedIds.includes(marker.id) && (marker.filterFlags & 1) === 1)
    assert.equal(filterMapMarkers(markers, { ...input, filterFlags: 1, likedIds }).meta.total_count, selected.length)
    assert.equal(filterMapClusters(points, { ...input, zoom: 12, filterFlags: 1, likedIds }).meta.total_count, selected.length)
  }
  assert.equal(filterMapClusters([], { ...input, zoom: 10 }).meta.total_count, 0)
  assert.equal(filterMapMarkers([{ ...markers[1], latitude: bounds.south },
    { ...markers[2], latitude: bounds.north }, { ...markers[3], latitude: bounds.north + 0.00001 }], input).meta.total_count, 2)
})

test('filter source rejects duplicate identities, invalid flags, NaNs and out-of-country coordinates', () => {
  assert.deepEqual(sanitizeMapFilterPoints([]), [])
  for (const bad of [[points[0], points[0]], [[0, 37, 127, 1]], [[1, 37, 127, 32]],
    [[1, 37, 127, '1']], [[1, null, 127, 1]], [[1, 35, 139, 1]], [[1, 37, 127, 1, 'secret']]])
    assert.throws(() => sanitizeMapFilterPoints(bad))
})

test('preview enriches current public markers only, excluding missing IDs and moved coordinates', () => {
  assert.deepEqual(enrichPreviewFilterMarkers([{ ...markers[2], filterFlags: undefined },
    { ...markers[3], latitude: 37.56 }, { ...markers[4], id: 99999 }], points), [markers[2]])
})

test('request validation rejects coercions, malformed mask, huge private selections and invalid bounds', () => {
  const raw = { southLat: 37.5, northLat: 37.6, westLng: 127, eastLng: 127.1, zoom: 8, filterFlags: 1 }
  assert.deepEqual(parseMapFilterInput({ ...raw, likedIds: [] }).likedIds, [])
  assert.deepEqual(parseMapFilterInput({ ...raw, likedIds: [1, 1, 2] }).likedIds, [1, 2])
  for (const change of [{ zoom: 15 }, { zoom: '8' }, { southLat: '37.5' }, { southLat: 38 },
    { filterFlags: 32 }, { filterFlags: -1 }, { filterFlags: 1.5 }, { filterFlags: '1' },
    { likedIds: null }, { likedIds: ['1'] }, { likedIds: [-1] }, { likedIds: Array(10001).fill(1) }, { includeList: 'true' }])
    assert.equal(parseMapFilterInput({ ...raw, ...change }), null)
})

test('POST guards return private no-store for disabled, cross-site, bad mask and oversized bodies', async () => {
  const previous = process.env.MAP_FILTERS_ENABLED
  const send = (body, extra = {}) => POST(new Request('https://preview.geupddong.com/api/map-filter-area', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body),
  }))
  try {
    process.env.MAP_FILTERS_ENABLED = 'false'
    assert.equal((await send({})).status, 404)
    process.env.MAP_FILTERS_ENABLED = 'true'
    const cross = await send({}, { Origin: 'https://attacker.example' })
    assert.equal(cross.status, 403)
    assert.equal(cross.headers.get('Cache-Control'), 'private, no-store')
    assert.equal((await send({}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403)
    assert.equal((await send({ filterFlags: 32 })).status, 400)
    assert.equal((await send({ excessive: 'x'.repeat(100001) })).status, 400)
    assert.equal((await send({}, { 'Content-Length': '100001' })).status, 400)
  } finally {
    if (previous === undefined) delete process.env.MAP_FILTERS_ENABLED
    else process.env.MAP_FILTERS_ENABLED = previous
  }
})
