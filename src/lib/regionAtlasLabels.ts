import { polygonParts, regionContains, type Region, type Position } from './regions.ts'

// Compact labels are only used on the Korean nationwide map, not in region titles or lists.
export const provinceMapNames: Record<string, string> = {
  '11': '서울', '26': '부산', '27': '대구', '28': '인천', '12': '전남',
  '30': '대전', '31': '울산', '36': '세종', '41': '경기', '51': '강원',
  '43': '충북', '44': '충남', '47': '경북', '48': '경남', '50': '제주', '52': '전북',
}

// Find an interior point on the largest land mass, away from its coastline.
export function regionLabelAnchor(region: Region): Position {
  const area = (ring: Position[]) => Math.abs(ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1] }, 0))
  const rings = [...polygonParts(region.geometry)].sort((a, b) => area(b[0]) - area(a[0]))[0]
  const points = rings[0]
  const west = Math.min(...points.map(p => p[0])), east = Math.max(...points.map(p => p[0]))
  const south = Math.min(...points.map(p => p[1])), north = Math.max(...points.map(p => p[1]))
  function clearance(x: number, y: number) {
    let inside = false, distance = Infinity
    for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j], [bx, by] = ring[i]
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside
      const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy
      const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0
      distance = Math.min(distance, Math.hypot(x - ax - t * dx, y - ay - t * dy))
    }
    return inside ? distance : -distance
  }
  let best: Position = points[0], score = -Infinity
  let box = { west, east, south, north }
  for (let pass = 0; pass < 3; pass++) {
    const dx = (box.east - box.west) / 16, dy = (box.north - box.south) / 16
    for (let ix = 0; ix <= 16; ix++) for (let iy = 0; iy <= 16; iy++) {
      const x = box.west + ix * dx, y = box.south + iy * dy, value = clearance(x, y)
      if (value > score) { score = value; best = [x, y] }
    }
    box = { west: best[0] - dx, east: best[0] + dx, south: best[1] - dy, north: best[1] + dy }
  }
  return best
}

export function regionLabelOptions(region: Region, anchor: Position): Position[] {
  const area = (part: Position[][]) => Math.abs(part[0].reduce((sum, p, i, ring) => {
    const q = ring[(i + 1) % ring.length]
    return sum + p[0] * q[1] - q[0] * p[1]
  }, 0))
  // Include major islands (e.g. Incheon's islands), while keeping every option on real land.
  const parts = [...polygonParts(region.geometry)].sort((a, b) => area(b) - area(a)).slice(0, 3)
  const candidates: Position[] = []
  for (const part of parts) {
    const xs = part[0].map(p => p[0]), ys = part[0].map(p => p[1])
    const west = Math.min(...xs), east = Math.max(...xs), south = Math.min(...ys), north = Math.max(...ys)
    const land = { ...region, geometry: { type: 'Polygon' as const, coordinates: part } }
    for (let x = 1; x < 10; x++) for (let y = 1; y < 10; y++) {
      const point: Position = [west + (east - west) * x / 10, south + (north - south) * y / 10]
      if (regionContains(land, point[0], point[1])) candidates.push(point)
    }
  }
  return candidates.sort((a, b) => Math.hypot(a[0] - anchor[0], a[1] - anchor[1]) - Math.hypot(b[0] - anchor[0], b[1] - anchor[1]))
}

export const atlasColors = ['#e2ece5', '#edf2ed', '#d8e7de', '#cddfd3']

// Shared boundary vertices form a small adjacency graph; neighbours get different green tones.
export function regionColors(regions: Region[]) {
  const vertices = regions.map(region => new Set(polygonParts(region.geometry).flat(2).map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`)))
  const colors: number[] = []
  regions.forEach((_, index) => {
    const neighbours = vertices.slice(0, index).flatMap((set, previous) => [...vertices[index]].some(key => set.has(key)) ? [colors[previous]] : [])
    const preferred = Array.from({ length: atlasColors.length }, (_, n) => (index + n) % atlasColors.length)
    colors.push(preferred.find(color => !neighbours.includes(color)) ?? index % atlasColors.length)
  })
  return colors.map(index => atlasColors[index])
}
