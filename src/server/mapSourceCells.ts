import type { ToiletMapItemResponse } from '../api/toilets'
import { cellBounds, cellKey, MAX_VIEWPORT_CELLS, validMapBounds, type MapCell } from '../lib/mapCells.ts'
import { completeFilterMarker, MAP_FILTER_SCHEMA } from '../lib/mapFilters.ts'
import { fetchMapCellOrigin, readThroughMapCells, sanitizeMapCellOriginResponse } from './mapCellCache.ts'
import type { R2BucketLike } from './sharedToiletCache'

export type MapSourceCellsResponse = { schema: 3; cells: Array<{ cell: MapCell; toilets: ToiletMapItemResponse[] }> }

// Complete live API facts cannot share the preview-enriched filter namespace:
// an older preview snapshot deliberately excludes new or moved public markers.
export function mapSourceCellBucket(bucket: R2BucketLike): R2BucketLike {
  const key = (original: string) => {
    if (!original.startsWith('map-cells/v1/')) throw new Error('Invalid source cell key')
    return original.replace('map-cells/v1/', 'map-source-cells/v1/')
  }
  return {
    async get(original) {
      const found = await bucket.get(key(original))
      if (!found) return null
      return { etag: found.etag, arrayBuffer: () => found.arrayBuffer(), async json<T>() {
        const value = await found.json<{ data?: Array<{ filterFlags?: number; filterSchema?: number }> }>()
        return (value?.data?.some(item => !completeFilterMarker(item)) ? null : value) as T
      } }
    },
    put: (original, value, options) => bucket.put(key(original), value, options),
  }
}

export function parseMapSourceCellsInput(value: unknown): MapCell[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  // This endpoint accepts public cell identities only; no account, likes or filter input.
  if (Object.keys(input).length !== 1 || !Array.isArray(input.cells)
    || input.cells.length < 1 || input.cells.length > MAX_VIEWPORT_CELLS) return null
  const keys = new Set<string>()
  const cells: MapCell[] = []
  for (const raw of input.cells) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const cell = raw as MapCell
    if (Object.keys(cell).length !== 2 || !Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y)
      || !validMapBounds(cellBounds(cell)) || keys.has(cellKey(cell))) return null
    keys.add(cellKey(cell))
    cells.push({ x: cell.x, y: cell.y })
  }
  return cells
}

export async function readMapSourceCells(bucket: R2BucketLike, cells: MapCell[]): Promise<{
  response: MapSourceCellsResponse; originReads: number; source: string
}> {
  const publicMarkers = (markers: ToiletMapItemResponse[], cell: MapCell) => {
    // Apply the whitelist to warm R2 records as well as new origin responses.
    const sanitized = sanitizeMapCellOriginResponse({ meta: { display_type: 'MARKER' }, toilets: markers }, cell)
    if (sanitized.some(marker => !completeFilterMarker(marker))) throw new Error('Map source attributes not ready')
    return sanitized
  }
  const results = await readThroughMapCells({ bucket: mapSourceCellBucket(bucket), cells,
    fetchOrigin: async cell => publicMarkers(await fetchMapCellOrigin(cell), cell) })
  const originReads = results.filter(result => result.source === 'miss').length
  return {
    response: { schema: MAP_FILTER_SCHEMA,
      // Return complete cells, including markers outside the current viewport.
      // The browser clips and filters these public facts for each new selection.
      cells: cells.map((cell, index) => ({ cell, toilets: publicMarkers(results[index].toilets, cell) })) },
    originReads, source: originReads ? 'miss' : 'hit',
  }
}
