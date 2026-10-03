import type { ToiletMapItemResponse, ToiletMapSearchResponse } from '../api/toilets'
import type { MapBounds } from './mapCells'
import { buildClusterBins, clusterBinsInBounds, validClusterBounds } from './mapClusters.ts'

// Public, affirmative attributes only. Unknown values never satisfy a condition.
export const MAP_FILTER_FLAGS = { open24h: 1, cctv: 2, diaper: 4, emergencyBell: 8, accessible: 16 } as const
export const MAX_MAP_FILTER_LIKED_IDS = 10_000
export type MapFilterPoint = [id: number, latitude: number, longitude: number, flags: number]
export type MapFilterInput = { bounds: MapBounds; zoom: number; includeList: boolean;
  filterFlags: number; likedIds?: number[] }

export function validFilterFlags(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 31
}

export function matchesMapFilters(flags: unknown, mask: number): boolean {
  return validFilterFlags(mask) && (mask === 0 || (validFilterFlags(flags) && (flags & mask) === mask))
}

export function parseMapFilterInput(value: unknown): MapFilterInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const bounds = { south: input.southLat, north: input.northLat,
    west: input.westLng, east: input.eastLng } as MapBounds
  if (!validClusterBounds(bounds) || !Number.isInteger(input.zoom) || Number(input.zoom) < 1 || Number(input.zoom) > 14
    || (input.includeList !== undefined && typeof input.includeList !== 'boolean')
    || !validFilterFlags(input.filterFlags ?? 0)) return null
  let likedIds: number[] | undefined
  if (input.likedIds !== undefined) {
    if (!Array.isArray(input.likedIds) || input.likedIds.length > MAX_MAP_FILTER_LIKED_IDS
      || input.likedIds.some(id => !Number.isSafeInteger(id) || Number(id) < 1)) return null
    likedIds = [...new Set(input.likedIds)]
  }
  return { bounds, zoom: Number(input.zoom), includeList: input.includeList === true,
    filterFlags: Number(input.filterFlags ?? 0), ...(likedIds === undefined ? {} : { likedIds }) }
}

export function sanitizeMapFilterPoints(value: unknown): MapFilterPoint[] {
  if (!Array.isArray(value) || value.length > 200_000) throw new Error('Invalid map filter source size')
  const ids = new Set<number>()
  return value.map(point => {
    if (!Array.isArray(point) || point.length !== 4 || !Number.isSafeInteger(point[0]) || point[0] < 1
      || ids.has(point[0]) || !Number.isFinite(point[1]) || !Number.isFinite(point[2])
      || point[1] < 32 || point[1] > 40 || point[2] < 124 || point[2] > 132
      || !validFilterFlags(point[3])) throw new Error('Invalid map filter source point')
    ids.add(point[0])
    return [point[0], point[1], point[2], point[3]]
  })
}

export function filterMapMarkers(markers: ToiletMapItemResponse[], input: MapFilterInput): ToiletMapSearchResponse {
  const liked = input.likedIds === undefined ? null : new Set(input.likedIds)
  const { south, north, west, east } = input.bounds
  const selected = new Map<number, ToiletMapItemResponse>()
  for (const marker of markers) {
    if (matchesMapFilters(marker.filterFlags, input.filterFlags) && (!liked || liked.has(marker.id))
      && marker.latitude >= south && marker.latitude <= north && marker.longitude >= west && marker.longitude <= east)
      selected.set(marker.id, marker)
  }
  const toilets = [...selected.values()].sort((a, b) => a.id - b.id)
  return { meta: { map_level: input.zoom, display_type: 'MARKER', total_count: toilets.length, result_count: toilets.length },
    toilets, clusters: [] }
}

export function filterMapClusters(points: MapFilterPoint[], input: MapFilterInput): ToiletMapSearchResponse {
  const liked = input.likedIds === undefined ? null : new Set(input.likedIds)
  const { south, north, west, east } = input.bounds
  const coordinates: [number, number][] = []
  for (const [id, latitude, longitude, flags] of points) {
    if (matchesMapFilters(flags, input.filterFlags) && (!liked || liked.has(id))
      && latitude >= south && latitude <= north && longitude >= west && longitude <= east)
      coordinates.push([latitude, longitude])
  }
  // Wide desktop/tablet viewports at zoom 7–9 can exceed the bounded cell fanout.
  // Reuse the finest overview grid rather than fetching unbounded full markers.
  const result = clusterBinsInBounds(buildClusterBins(coordinates), input.bounds, Math.max(10, input.zoom))
  return { ...result, meta: { ...result.meta, map_level: input.zoom } }
}

// The preview snapshot is not an authority for names/current public visibility.
// Only enrich currently returned public markers with a matching stable position.
export function enrichPreviewFilterMarkers(markers: ToiletMapItemResponse[], points: MapFilterPoint[]): ToiletMapItemResponse[] {
  const index = new Map(points.map(point => [point[0], point]))
  return markers.flatMap(marker => {
    const point = index.get(marker.id)
    return point && Math.abs(marker.latitude - point[1]) < 0.00001 && Math.abs(marker.longitude - point[2]) < 0.00001
      ? [{ ...marker, filterFlags: point[3] }] : []
  })
}
