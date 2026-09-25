import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { atlasPath, atlasProjection } from '../src/lib/regionAtlasGeometry.ts'
import { districtsIn, provinces } from '../src/lib/regions.ts'

const directory = resolve('public/region-atlas')
await mkdir(directory, { recursive: true })

async function build(name, regions, province) {
  const { width, height, project } = atlasProjection(regions, province)
  const paths = regions.map(region => `<g id="r-${region.code}"><path d="${atlasPath(region, project)}" fill-rule="evenodd"/></g>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${paths}</svg>\n`
  const hash = createHash('sha256').update(svg).digest('hex').slice(0, 12)
  const filename = `${name}.${hash}.svg`
  await writeFile(resolve(directory, filename), svg)
  return `/region-atlas/${filename}`
}

const manifest = {
  national: await build('national', provinces, false),
  provinces: Object.fromEntries(await Promise.all(provinces.map(async province => [
    province.code, await build(province.code, districtsIn(province.code), true),
  ]))),
}
await writeFile(resolve('data/regions/atlas-assets.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({ national: manifest.national, provinces: Object.keys(manifest.provinces).length }))
