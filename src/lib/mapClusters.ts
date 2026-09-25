import type { ToiletMapSearchResponse } from '../api/toilets'
import type { MapBounds } from './mapCells'

export type ClusterPoint = [latitude: number, longitude: number]
export type ClusterBin = { y: number; x: number; count: number; sumLatitude: number; sumLongitude: number;
  // Exact edge clipping is possible without asking the origin again.
  points: ClusterPoint[] }
const BASE_FACTOR = 100 // 0.01 degree bins align with every API cluster level.

export function mapClusterZoomSupported(zoom: number): boolean {
  return Number.isInteger(zoom) && zoom >= 10 && zoom <= 14
}

export function validClusterBounds(bounds: MapBounds): boolean {
  return Object.values(bounds).every(Number.isFinite)
    && bounds.south >= -90 && bounds.north <= 90 && bounds.south <= bounds.north
    && bounds.west >= -180 && bounds.east <= 180 && bounds.west <= bounds.east
}

export function mapClusterGridFactor(zoom: number): number {
  switch (zoom) {
    case 10: return 100
    case 11: return 50
    case 12: return 20
    case 13: return 10
    case 14: return 5
    default: throw new Error('Unsupported cluster zoom')
  }
}

export function sanitizeClusterPoints(value: unknown): ClusterPoint[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 200_000)
    throw new Error('Invalid cluster source size')
  return value.map((point): ClusterPoint => {
    if (!Array.isArray(point) || point.length !== 2
      || !Number.isFinite(point[0]) || !Number.isFinite(point[1])
      || point[0] < 32 || point[0] > 40 || point[1] < 124 || point[1] > 132)
      throw new Error('Invalid cluster source point')
    return [point[0], point[1]]
  })
}

export function buildClusterBins(points: ClusterPoint[]): ClusterBin[] {
  const bins = new Map<string, ClusterBin>()
  for (const [latitude, longitude] of points) {
    const y = Math.floor(latitude * BASE_FACTOR + 1e-9)
    const x = Math.floor(longitude * BASE_FACTOR + 1e-9)
    const key = `${y}:${x}`
    const bin = bins.get(key)
    if (bin) {
      bin.count++
      bin.sumLatitude += latitude
      bin.sumLongitude += longitude
      bin.points.push([latitude, longitude])
    } else bins.set(key, { y, x, count: 1, sumLatitude: latitude, sumLongitude: longitude,
      points: [[latitude, longitude]] })
  }
  return [...bins.values()].sort((a, b) => a.y - b.y || a.x - b.x)
}

export function validClusterBins(value: unknown): value is ClusterBin[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 200_000) return false
  let total = 0
  for (const bin of value) {
    if (!bin || !Number.isSafeInteger(bin.y) || !Number.isSafeInteger(bin.x)
      || !Number.isSafeInteger(bin.count) || bin.count < 1
      || !Number.isFinite(bin.sumLatitude) || !Number.isFinite(bin.sumLongitude)
      || !Array.isArray(bin.points) || bin.points.length !== bin.count) return false
    total += bin.count
    if (total > 200_000) return false
    for (const point of bin.points) {
      if (!Array.isArray(point) || point.length !== 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1])
        || Math.floor(point[0] * BASE_FACTOR + 1e-9) !== bin.y
        || Math.floor(point[1] * BASE_FACTOR + 1e-9) !== bin.x) return false
    }
  }
  return true
}

export function clusterBinsInBounds(bins: ClusterBin[], bounds: MapBounds, zoom: number): ToiletMapSearchResponse {
  if (!validClusterBounds(bounds) || !mapClusterZoomSupported(zoom)) throw new Error('Invalid cluster viewport')
  const factor = mapClusterGridFactor(zoom)
  const groups = new Map<string, { y: number; x: number; latitude: number; longitude: number; count: number }>()
  let total = 0
  const add = (y: number, x: number, count: number, latitude: number, longitude: number) => {
    const key = `${y}:${x}`
    const group = groups.get(key)
    if (group) {
      group.latitude += latitude
      group.longitude += longitude
      group.count += count
    } else groups.set(key, { y, x, latitude, longitude, count })
    total += count
  }
  for (const bin of bins) {
    const south = bin.y / BASE_FACTOR, north = (bin.y + 1) / BASE_FACTOR
    const west = bin.x / BASE_FACTOR, east = (bin.x + 1) / BASE_FACTOR
    if (north < bounds.south || south > bounds.north || east < bounds.west || west > bounds.east) continue
    if (south >= bounds.south && north <= bounds.north && west >= bounds.west && east <= bounds.east) {
      add(Math.floor(bin.y * factor / BASE_FACTOR), Math.floor(bin.x * factor / BASE_FACTOR),
        bin.count, bin.sumLatitude, bin.sumLongitude)
      continue
    }
    for (const [latitude, longitude] of bin.points) {
      if (latitude < bounds.south || latitude > bounds.north || longitude < bounds.west || longitude > bounds.east) continue
      add(Math.floor(latitude * factor + 1e-9), Math.floor(longitude * factor + 1e-9),
        1, latitude, longitude)
    }
  }
  const clusters = [...groups.values()].sort((a, b) => a.y - b.y || a.x - b.x)
    .map(group => ({ latitude: group.latitude / group.count,
      longitude: group.longitude / group.count, count: group.count }))
  return { meta: { map_level: zoom, display_type: 'CLUSTER', total_count: total, result_count: clusters.length },
    toilets: [], clusters }
}
