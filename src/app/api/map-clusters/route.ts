import { mapClusterZoomSupported, clusterBinsInBounds, validClusterBounds } from '../../../lib/mapClusters'
import type { MapBounds } from '../../../lib/mapCells'
import { getMapCellBucket } from '../../../server/mapCellCache'
import { readThroughMapClusterCache } from '../../../server/mapClusterCache'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }

function requestValues(request: Request): { bounds: MapBounds; zoom: number } | null {
  const query = new URL(request.url).searchParams
  const fields = ['southLat', 'northLat', 'westLng', 'eastLng', 'zoom']
  if (fields.some(field => query.getAll(field).length !== 1)) return null
  const [south, north, west, east, zoom] = fields.map(field => Number(query.get(field)))
  const bounds = { south, north, west, east }
  return validClusterBounds(bounds) && mapClusterZoomSupported(zoom) ? { bounds, zoom } : null
}

export async function GET(request: Request) {
  if (process.env.MAP_CLUSTER_CACHE_ENABLED !== 'true')
    return Response.json({ error: 'Disabled' }, { status: 404, headers })
  const input = requestValues(request)
  if (!input) return Response.json({ error: 'Unsupported viewport' }, { status: 400, headers })
  try {
    const bucket = await getMapCellBucket()
    if (!bucket) return Response.json({ error: 'Unavailable' }, { status: 503, headers })
    const result = await readThroughMapClusterCache({ bucket })
    return Response.json(clusterBinsInBounds(result.bins, input.bounds, input.zoom), {
      headers: { ...headers, 'X-Map-Cluster-Cache': result.source,
        'X-Map-Origin-Reads': result.source === 'miss' ? '1' : '0' },
    })
  } catch (error) {
    console.error('Map cluster cache failed', error)
    return Response.json({ error: 'Map temporarily unavailable' }, { status: 503, headers })
  }
}
