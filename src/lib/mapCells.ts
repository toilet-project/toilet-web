import type { ToiletMapItemResponse, ToiletMapSearchResponse } from '../api/toilets'

export const MAP_CELL_UNITS = 20 // 0.05 degrees; integer indices avoid float cache keys.
export const MAX_VIEWPORT_CELLS = 16
export function mapCellZoomSupported(zoom: number): boolean {
  return Number.isInteger(zoom) && zoom >= 6 && zoom <= 9
}
export type MapBounds = { south: number; north: number; west: number; east: number }
export type MapCell = { x: number; y: number }

const VALID_REGION = { south: 32, north: 40, west: 124, east: 132 }

export function validMapBounds(bounds: MapBounds): boolean {
  return Object.values(bounds).every(Number.isFinite)
    && bounds.south <= bounds.north && bounds.west <= bounds.east
    && bounds.south >= VALID_REGION.south && bounds.north <= VALID_REGION.north
    && bounds.west >= VALID_REGION.west && bounds.east <= VALID_REGION.east
}

export function cellBounds(cell: MapCell): MapBounds {
  return { south: cell.y / MAP_CELL_UNITS, north: (cell.y + 1) / MAP_CELL_UNITS,
    west: cell.x / MAP_CELL_UNITS, east: (cell.x + 1) / MAP_CELL_UNITS }
}

export function cellKey(cell: MapCell): string { return `${cell.y}:${cell.x}` }

export function cellsForBounds(bounds: MapBounds, maximum = MAX_VIEWPORT_CELLS): MapCell[] | null {
  if (!validMapBounds(bounds) || !Number.isSafeInteger(maximum) || maximum < 1) return null
  // Include the upper-edge cell: the legacy API's BETWEEN predicate is inclusive.
  const minY = Math.floor(bounds.south * MAP_CELL_UNITS)
  const maxY = Math.min(Math.floor(bounds.north * MAP_CELL_UNITS), VALID_REGION.north * MAP_CELL_UNITS - 1)
  const minX = Math.floor(bounds.west * MAP_CELL_UNITS)
  const maxX = Math.min(Math.floor(bounds.east * MAP_CELL_UNITS), VALID_REGION.east * MAP_CELL_UNITS - 1)
  if (maxY < minY || maxX < minX) return null
  if ((maxY - minY + 1) * (maxX - minX + 1) > maximum) return null
  const cells: MapCell[] = []
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) cells.push({ x, y })
  return cells
}

export function cellsForInvalidation(bounds: MapBounds | null, maximum = 64): MapCell[] | null {
  if (bounds === null) return []
  if (!validMapBounds(bounds)) return null
  // A point exactly on a boundary can be present in both inclusive cells.
  return cellsForBounds({ south: Math.max(VALID_REGION.south, bounds.south - 1e-8),
    north: Math.min(VALID_REGION.north, bounds.north + 1e-8),
    west: Math.max(VALID_REGION.west, bounds.west - 1e-8),
    east: Math.min(VALID_REGION.east, bounds.east + 1e-8) }, maximum)
}

export function mergeMapCells(bounds: MapBounds, zoom: number, responses: ToiletMapSearchResponse[]): ToiletMapSearchResponse {
  const toilets = new Map<number, ToiletMapItemResponse>()
  for (const response of responses) {
    if (response.meta.display_type !== 'MARKER' || !Array.isArray(response.toilets)) throw new Error('Invalid map cell response')
    for (const toilet of response.toilets) {
      if (!Number.isSafeInteger(toilet.id) || !Number.isFinite(toilet.latitude) || !Number.isFinite(toilet.longitude)) continue
      if (toilet.latitude >= bounds.south && toilet.latitude <= bounds.north
        && toilet.longitude >= bounds.west && toilet.longitude <= bounds.east) toilets.set(toilet.id, toilet)
    }
  }
  const visible = [...toilets.values()].sort((a, b) => a.id - b.id)
  return { meta: { map_level: zoom, display_type: 'MARKER', total_count: visible.length, result_count: visible.length },
    toilets: visible, clusters: [] }
}
