import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import manifest from '../data/regions/atlas-assets.json' with { type: 'json' }
import { atlasPath, atlasProjection } from '../src/lib/regionAtlasGeometry.ts'
import { districtsIn, provinces } from '../src/lib/regions.ts'

test('language-neutral atlas assets match the current region boundaries', async () => {
  for (const [href, regions, province] of [
    [manifest.national, provinces, false],
    ...provinces.map(item => [manifest.provinces[item.code], districtsIn(item.code), true]),
  ]) {
    const { width, height, project } = atlasProjection(regions, province)
    const paths = regions.map(region => `<g id="r-${region.code}"><path d="${atlasPath(region, project)}" fill-rule="evenodd"/></g>`).join('')
    const expected = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${paths}</svg>\n`
    const hash = createHash('sha256').update(expected).digest('hex').slice(0, 12)
    assert.match(href, new RegExp(`\\.${hash}\\.svg$`))
    assert.equal(await readFile(new URL(`../public${href}`, import.meta.url), 'utf8'), expected)
  }
})
