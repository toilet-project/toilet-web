import type { ToiletMapItemResponse, ToiletMapSearchResponse } from '../api/toilets'
import { cellsForBounds, type MapBounds } from '../lib/mapCells.ts'
import { mapClusterZoomSupported } from '../lib/mapClusters.ts'
import { enrichPreviewFilterMarkers, filterMapClusters, filterMapMarkers, validFilterFlags,
  type MapFilterInput } from '../lib/mapFilters.ts'
import { fetchMapCellOrigin, sanitizeMapCellOriginResponse } from './mapCellCache.ts'
import { mapFilterPreviewEnabled, readPreviewMapFilterSource, readThroughFilterCell,
  readThroughMapFilterSource, type MapFilterSource } from './mapFilterCache.ts'
import type { R2BucketLike } from './sharedToiletCache'

function clippedBounds(bounds: MapBounds): MapBounds | null {
  const clipped = { south: Math.max(32, bounds.south), north: Math.min(40, bounds.north),
    west: Math.max(124, bounds.west), east: Math.min(132, bounds.east) }
  return clipped.south <= clipped.north && clipped.west <= clipped.east ? clipped : null
}

async function fetchBoundedMarkers(bounds: MapBounds): Promise<ToiletMapItemResponse[]> {
  if (bounds.north - bounds.south > 1 || bounds.east - bounds.west > 1) throw new Error('Map filter viewport too large')
  const origin = process.env.TOILET_API_ORIGIN ?? 'https://api.geupddong.com'
  const query = new URLSearchParams({ southLat: String(bounds.south), northLat: String(bounds.north),
    westLng: String(bounds.west), eastLng: String(bounds.east), zoom: '8', includeList: 'true' })
  const response = await fetch(`${origin.replace(/\/$/, '')}/api/v1/toilets?${query}`, {
    cache: 'no-store', signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error(`Map filter markers HTTP ${response.status}`)
  const payload = await response.json() as Partial<ToiletMapSearchResponse>
  const raw = payload.toilets ?? []
  if (payload.meta?.display_type !== 'MARKER' || payload.meta.total_count !== raw.length
    || !Array.isArray(raw) || raw.length > 25_000) throw new Error('Incomplete map filter markers')
  // Reuse the public whitelist and coordinate checks, one raw marker at a time.
  return raw.map(marker => sanitizeMapCellOriginResponse({ meta: { display_type: 'MARKER' }, toilets: [marker] },
    { x: Math.floor(marker.longitude * 20), y: Math.floor(marker.latitude * 20) })[0])
}

export async function readMapFilterArea(bucket: R2BucketLike, input: MapFilterInput): Promise<{
  response: ToiletMapSearchResponse; originReads: number; sourceDate?: string; source: string
}> {
  const clustered = !input.includeList && mapClusterZoomSupported(input.zoom)
  const empty = () => clustered ? filterMapClusters([], input) : filterMapMarkers([], input)
  const bounds = clippedBounds(input.bounds)
  if (!bounds || input.likedIds?.length === 0) return { response: empty(), originReads: 0, source: 'empty' }
  const preview = mapFilterPreviewEnabled()
  let source: MapFilterSource | undefined
  if (preview) source = await readPreviewMapFilterSource(bucket)
  if (clustered) {
    source ??= await readThroughMapFilterSource({ bucket })
    return { response: filterMapClusters(source.points, input), originReads: source.source === 'miss' ? 1 : 0,
      sourceDate: source.sourceDate, source: source.source }
  }
  const enrich = (markers: ToiletMapItemResponse[]) => {
    if (preview) return enrichPreviewFilterMarkers(markers, source!.points)
    if (markers.some(marker => !validFilterFlags(marker.filterFlags))) throw new Error('Map filter API not ready')
    return markers
  }
  const cells = cellsForBounds(bounds)
  let markers: ToiletMapItemResponse[] = []
  let originReads = 0
  if (cells) {
    let cursor = 0
    await Promise.all(Array.from({ length: Math.min(4, cells.length) }, async () => {
      while (cursor < cells.length) {
        const cell = cells[cursor++]
        const result = await readThroughFilterCell({ bucket, cell, previewSourceDate: source?.sourceRevision,
          fetchOrigin: async () => enrich(await fetchMapCellOrigin(cell)) })
        // Refresh preview flags against the current snapshot even if the cell is warm.
        markers.push(...enrich(result.toilets))
        if (result.source === 'miss') originReads++
      }
    }))
  } else {
    markers = enrich(await fetchBoundedMarkers(bounds))
    originReads = 1
  }
  return { response: filterMapMarkers(markers, input), originReads, sourceDate: source?.sourceDate,
    source: preview ? 'preview' : originReads ? 'miss' : 'hit' }
}
