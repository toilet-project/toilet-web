import { cellsForBounds, cellBounds, mergeMapCells } from '../src/lib/mapCells.ts'

// Read-only, bounded contract comparison against the existing public map API.
const origin = process.env.MAP_VERIFY_API_ORIGIN || 'https://api.geupddong.com'
const viewports = [
  ['Seoul', { south: 37.54, north: 37.57, west: 126.95, east: 127.00 }],
  ['Daejeon', { south: 36.34, north: 36.37, west: 127.38, east: 127.43 }],
  ['Busan', { south: 35.14, north: 35.17, west: 129.04, east: 129.09 }],
  ['Jeju', { south: 33.49, north: 33.52, west: 126.50, east: 126.55 }],
]

async function read(bounds) {
  const query = new URLSearchParams({ southLat: String(bounds.south), northLat: String(bounds.north),
    westLng: String(bounds.west), eastLng: String(bounds.east), zoom: '6', includeList: 'true' })
  const response = await fetch(`${origin}/api/v1/toilets?${query}`, {
    signal: AbortSignal.timeout(8_000), headers: { 'User-Agent': 'Geupddong-MapCell-ReadOnly-Verification/2026-09-24' },
  })
  if (!response.ok) throw new Error(`Map contract HTTP ${response.status}`)
  return response.json()
}

for (const [name, bounds] of viewports) {
  const cells = cellsForBounds(bounds)
  if (!cells) throw new Error(`${name}: unsupported viewport`)
  const legacy = await read(bounds)
  const parts = []
  for (const cell of cells) parts.push(await read(cellBounds(cell)))
  const merged = mergeMapCells(bounds, 6, parts)
  const expected = [...new Set(legacy.toilets.map(toilet => toilet.id))].sort((a, b) => a - b)
  const actual = merged.toilets.map(toilet => toilet.id)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name}: marker IDs differ (${expected.length} legacy, ${actual.length} cells)`)
  }
  process.stdout.write(`${name}: ${actual.length} markers, ${cells.length} shared cells, IDs match\n`)
}
