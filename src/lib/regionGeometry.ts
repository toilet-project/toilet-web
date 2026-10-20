export type Position = [number, number]
export type RegionGeometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: Position[][] | Position[][][] }

type GeometryRegion = { geometry: RegionGeometry }
type Bounds = { west: number; south: number; east: number; north: number }

export function polygonParts(geometry: RegionGeometry): Position[][][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates as Position[][]] : geometry.coordinates as Position[][][]
}

// Boundary objects are immutable release data. Reuse their envelopes across
// facility lookups without flattening every polygon for every facility.
const boundsByGeometry = new WeakMap<RegionGeometry, Readonly<Bounds>>()

export function regionBounds(region: GeometryRegion): Readonly<Bounds> {
  const cached = boundsByGeometry.get(region.geometry)
  if (cached) return cached
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity
  for (const rings of polygonParts(region.geometry)) for (const ring of rings) for (const [lng, lat] of ring) {
    west = Math.min(west, lng); south = Math.min(south, lat)
    east = Math.max(east, lng); north = Math.max(north, lat)
  }
  const bounds = Object.freeze({ west, south, east, north })
  boundsByGeometry.set(region.geometry, bounds)
  return bounds
}

function ringContains(ring: Position[], x: number, y: number) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function regionContains(region: GeometryRegion, longitude: number, latitude: number) {
  const { west, south, east, north } = regionBounds(region)
  if (longitude < west || longitude > east || latitude < south || latitude > north) return false
  return polygonParts(region.geometry).some(rings => ringContains(rings[0], longitude, latitude) && !rings.slice(1).some(ring => ringContains(ring, longitude, latitude)))
}
