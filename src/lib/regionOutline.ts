import { atlasPath } from './regionAtlasGeometry.ts'
import { regionBounds, type Position, type Region } from './regions.ts'

/** A precise boundary thumbnail, separate from the full NAVER map. */
export function regionOutlineSvg(region: Region) {
  const { west, east, south, north } = regionBounds(region)
  const width = 760, height = 420, pad = 35
  const longitudeScale = Math.cos(37 * Math.PI / 180)
  const xSpan = (east - west) * longitudeScale, ySpan = north - south
  const scale = Math.min((width - 2 * pad) / xSpan, (height - 2 * pad) / ySpan)
  const xOffset = (width - xSpan * scale) / 2, yOffset = (height - ySpan * scale) / 2
  const project = ([longitude, latitude]: Position): Position => [
    xOffset + (longitude - west) * longitudeScale * scale,
    yOffset + (north - latitude) * scale,
  ]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path d="${atlasPath(region, project)}" fill="#e7f2eb" fill-rule="evenodd" stroke="#368058" stroke-width="2" stroke-linejoin="round"/></svg>\n`
}
