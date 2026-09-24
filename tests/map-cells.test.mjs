import assert from 'node:assert/strict'
import test from 'node:test'
import { cellBounds, cellKey, cellsForBounds, cellsForInvalidation, mapCellZoomSupported, mergeMapCells } from '../src/lib/mapCells.ts'

test('shared cells cover the initial map level but not close-up or cluster levels', () => {
  assert.equal(mapCellZoomSupported(5), false)
  assert.equal(mapCellZoomSupported(6), true)
  assert.equal(mapCellZoomSupported(9), true)
  assert.equal(mapCellZoomSupported(10), false)
})

test('preview and production bundles both request shared map cells', async () => {
  const original = process.env.SITE_INDEXABLE
  try {
    for (const [siteIndexable, expected] of [['false', 'true'], ['true', 'true'], ['', 'false']]) {
      process.env.SITE_INDEXABLE = siteIndexable
      const { default: config } = await import(`../next.config.ts?map-cell-${siteIndexable || 'local'}`)
      assert.equal(config.env.NEXT_PUBLIC_MAP_CELL_CACHE_ENABLED, expected)
    }
  } finally {
    if (original === undefined) delete process.env.SITE_INDEXABLE
    else process.env.SITE_INDEXABLE = original
  }
})

test('nearby viewports share stable cells and broad viewports fall back', () => {
  const first = cellsForBounds({ south: 37.54, north: 37.57, west: 126.95, east: 127 })
  const shifted = cellsForBounds({ south: 37.546, north: 37.576, west: 126.956, east: 127.006 })
  assert.ok(first && shifted)
  assert.ok(first.some(cell => shifted.some(other => cellKey(cell) === cellKey(other))))
  assert.equal(cellsForBounds({ south: 35, north: 37, west: 126, east: 128 }), null)
  assert.deepEqual(cellBounds({ x: 2540, y: 750 }), { south: 37.5, north: 37.55, west: 127, east: 127.05 })
  assert.deepEqual(cellsForBounds({ south: 39.99, north: 40, west: 131.99, east: 132 }),
    [{ x: 2639, y: 799 }])
  assert.equal(cellsForBounds({ south: 40, north: 40, west: 132, east: 132 }), null)
})

test('invalidation covers both inclusive cells at an exact boundary', () => {
  const cells = cellsForInvalidation({ south: 37.5, north: 37.5, west: 127, east: 127 })
  assert.deepEqual(cells?.map(cellKey), ['749:2539', '749:2540', '750:2539', '750:2540'])
  assert.deepEqual(cellsForInvalidation(null), [])
})

test('merge clips overfetch and deduplicates shared cell edges', () => {
  const marker = (id, latitude, longitude) => ({ id, name: `t${id}`, latitude, longitude })
  const response = toilets => ({ meta: { map_level: 6, display_type: 'MARKER', total_count: toilets.length, result_count: toilets.length }, toilets, clusters: [] })
  const merged = mergeMapCells({ south: 37.54, north: 37.57, west: 126.95, east: 127 }, 6,
    [response([marker(1, 37.55, 127), marker(2, 37.6, 126.99)]), response([marker(1, 37.55, 127), marker(3, 37.56, 126.96)])])
  assert.deepEqual(merged.toilets.map(toilet => toilet.id), [1, 3])
  assert.equal(merged.meta.total_count, 2)
})
