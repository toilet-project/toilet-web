import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import preciseSource from '../data/regions/sgg-precise.json' with { type: 'json' }
import { allDistricts } from '../src/lib/regions.ts'
import { regionOutlineSvg } from '../src/lib/regionOutline.ts'

const directory = resolve('public/region-outline')
await mkdir(directory, { recursive: true })
const precise = new Map(preciseSource.features.map(feature => [feature.properties.sgg, feature.geometry]))
const manifest = {}
for (const district of allDistricts()) {
  const geometry = precise.get(district.code)
  if (!geometry) throw new Error(`Missing precise boundary for ${district.code}`)
  const svg = regionOutlineSvg({ ...district, geometry })
  const hash = createHash('sha256').update(svg).digest('hex').slice(0, 12)
  const filename = `${district.code}.${hash}.svg`
  await writeFile(resolve(directory, filename), svg)
  manifest[district.code] = `/region-outline/${filename}`
}
await writeFile(resolve('data/regions/outline-assets.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({ districts: Object.keys(manifest).length }))
