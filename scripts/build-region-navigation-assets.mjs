import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import precise from '../data/regions/sgg-precise.json' with { type: 'json' }
import { provinces, districtsIn, polygonParts, regionBounds } from '../src/lib/regions.ts'
import { atlasProjection } from '../src/lib/regionAtlasGeometry.ts'
import { regionColors, regionLabelAnchor, regionLabelOptions } from '../src/lib/regionAtlasLabels.ts'

const layouts = {}
for (const province of [null, ...provinces]) {
  const regions = province ? districtsIn(province.code) : provinces
  const colors = regionColors(regions)
  const { width, height, project } = atlasProjection(regions, Boolean(province))
  layouts[province?.code ?? 'national'] = { width, height, areas: regions.map((region, index) => {
    const bounds = regionBounds(region), anchor = regionLabelAnchor(region)
    const emphasized = !province && region.code === '11'
    const surface = polygonParts(region.geometry).reduce((sum, rings) => sum + rings.reduce((part, ring, ringIndex) => part + (ringIndex ? -1 : 1) * Math.abs(ring.reduce((area, point, i) => {
      const p = project(point), next = project(ring[(i + 1) % ring.length])
      return area + p[0] * next[1] - next[0] * p[1]
    }, 0)) / 2, 0), 0)
    return { code: region.code, anchor: project(anchor), alternatives: !province && !emphasized ? regionLabelOptions(region, anchor).map(project) : [],
      color: emphasized ? '#317756' : colors[index], surface,
      regionWidth: project([bounds.east, bounds.north])[0] - project([bounds.west, bounds.north])[0] }
  }) }
}
await writeFile('data/regions/atlas-layouts.json', JSON.stringify(layouts) + '\n')
await mkdir('public/region-boundaries', { recursive: true })
const manifest = {}
for (const feature of precise.features) {
  const code = feature.properties.sgg, geometry = feature.geometry
  const body = JSON.stringify(geometry), hash = createHash('sha256').update(body).digest('hex').slice(0, 12)
  const href = `/region-boundaries/${code}.${hash}.json`
  await writeFile(`public${href}`, body)
  manifest[code] = { href, bounds: regionBounds({ geometry }) }
}
await writeFile('data/regions/boundary-assets.json', JSON.stringify(manifest) + '\n')
console.log(JSON.stringify({ atlasLayouts: Object.keys(layouts).length, boundaries: Object.keys(manifest).length }))
