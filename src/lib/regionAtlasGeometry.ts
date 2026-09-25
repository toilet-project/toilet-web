import { polygonParts, regionBounds, type Position, type Region } from './regions.ts'

export function atlasProjection(regions: Region[], province: boolean) {
  const bounds = regions.map(regionBounds)
  const boundary = {
    west: Math.min(...bounds.map(value => value.west)),
    south: Math.min(...bounds.map(value => value.south)),
    east: Math.max(...bounds.map(value => value.east)),
    north: Math.max(...bounds.map(value => value.north)),
  }
  const width = 760, pad = 32
  const xSpan = (boundary.east - boundary.west) * Math.cos(37 * Math.PI / 180)
  const ySpan = boundary.north - boundary.south
  const height = province ? Math.round(width * ySpan / xSpan) : 800
  const scale = Math.min((width - 2 * pad) / xSpan, (height - 2 * pad) / ySpan)
  const drawnWidth = xSpan * scale, drawnHeight = ySpan * scale
  const xOffset = (width - drawnWidth) / 2, yOffset = (height - drawnHeight) / 2
  const project = ([longitude, latitude]: Position): Position => [
    xOffset + (longitude - boundary.west) * Math.cos(37 * Math.PI / 180) * scale,
    yOffset + (boundary.north - latitude) * scale,
  ]
  return { width, height, project }
}

export function atlasPath(region: Region, project: (point: Position) => Position) {
  return polygonParts(region.geometry).map(rings => rings.map(ring => ring.map((point, index) => {
    const [x, y] = project(point)
    return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ') + 'Z').join(' ')).join(' ')
}
