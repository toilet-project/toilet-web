import { cellsForBounds, mapCellZoomSupported, mergeMapCells, type MapBounds } from '../../../lib/mapCells'
import { fetchMapCellOrigin, getMapCellBucket, readThroughMapCell } from '../../../server/mapCellCache'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }

function requestValues(request: Request): { bounds: MapBounds; zoom: number } | null {
  const query = new URL(request.url).searchParams
  const fields = ['southLat', 'northLat', 'westLng', 'eastLng', 'zoom']
  if (fields.some(field => query.getAll(field).length !== 1)) return null
  const numbers = fields.map(field => Number(query.get(field)))
  if (numbers.some(value => !Number.isFinite(value))) return null
  const [south, north, west, east, zoom] = numbers
  if (!mapCellZoomSupported(zoom)) return null
  return { bounds: { south, north, west, east }, zoom }
}

export async function GET(request: Request) {
  if (process.env.MAP_CELL_CACHE_ENABLED !== 'true') return Response.json({ error: 'Disabled' }, { status: 404, headers })
  const input = requestValues(request)
  const cells = input && cellsForBounds(input.bounds)
  if (!input || !cells) return Response.json({ error: 'Unsupported viewport' }, { status: 400, headers })
  try {
    const bucket = await getMapCellBucket()
    const results: Awaited<ReturnType<typeof readThroughMapCell>>[] = []
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(2, cells.length) }, async () => {
      while (cursor < cells.length) {
        const cell = cells[cursor++]
        results.push(bucket ? await readThroughMapCell({ bucket, cell })
          : { toilets: await fetchMapCellOrigin(cell), source: 'miss' })
      }
    }))
    const merged = mergeMapCells(input.bounds, input.zoom, results.map(result => ({
      meta: { map_level: input.zoom, display_type: 'MARKER' as const,
        total_count: result.toilets.length, result_count: result.toilets.length },
      toilets: result.toilets, clusters: [],
    })))
    const originReads = results.filter(result => result.source === 'miss').length
    return Response.json(merged, { headers: { ...headers,
      'X-Map-Cells': String(cells.length), 'X-Map-Origin-Reads': String(originReads) } })
  } catch (error) {
    console.error('Map area cache failed', error)
    return Response.json({ error: 'Map temporarily unavailable' }, { status: 503, headers })
  }
}
