import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import preciseSource from '../data/regions/sgg-precise.json' with { type: 'json' }
import manifest from '../data/regions/outline-assets.json' with { type: 'json' }
import { allDistricts } from '../src/lib/regions.ts'
import { regionOutlineSvg } from '../src/lib/regionOutline.ts'

test('all district loading outlines use the current precise boundaries', async () => {
  const precise = new Map(preciseSource.features.map(feature => [feature.properties.sgg, feature.geometry]))
  const districts = allDistricts()
  assert.equal(Object.keys(manifest).length, districts.length)
  for (const district of districts) {
    const geometry = precise.get(district.code)
    assert.ok(geometry, `missing ${district.code}`)
    const svg = regionOutlineSvg({ ...district, geometry })
    const hash = createHash('sha256').update(svg).digest('hex').slice(0, 12)
    const href = manifest[district.code]
    assert.match(href, new RegExp(`/${district.code}\\.${hash}\\.svg$`))
    assert.equal(await readFile(new URL(`../public${href}`, import.meta.url), 'utf8'), svg)
  }
  const headers = await readFile(new URL('../public/_headers', import.meta.url), 'utf8')
  assert.match(headers, /\/region-outline\/\*\s+Cache-Control: public,max-age=31536000,immutable/)
})
