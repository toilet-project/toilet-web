import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { regionNavigationTarget } from '../src/lib/regionNavigation.ts'
import { regionMarkersResponse } from '../region-markers-worker.ts'
import { invalidateRegionMarkers, readThroughRegionMarkers, regionMarkerGlobalKey, regionMarkerObjectKey } from '../src/lib/regionMarkerStore.ts'
import { allDistricts, provinces, districtsIn, regionBounds } from '../src/lib/regions.ts'
import source from '../data/regions/sgg-precise.json' with { type: 'json' }
import boundaries from '../data/regions/boundary-assets.json' with { type: 'json' }
import layouts from '../data/regions/atlas-layouts.json' with { type: 'json' }

test('instant navigation accepts atlas URLs in six languages but excludes facility and external links', () => {
  for (const [prefix, locale] of [['','ko'],['en/','en'],['ja/','ja'],['zh-cn/','zh-CN'],['zh-tw/','zh-TW'],['zh-hk/','zh-HK']]) {
    const target = regionNavigationTarget(`/${prefix}regions/11/11110`)
    assert.equal(target.locale, locale)
    assert.equal(target.district.code, '11110')
    assert.equal(regionNavigationTarget(encodeURI(target.href)).href, target.href)
    assert.equal(regionNavigationTarget(`/${prefix}regions`).province, null)
  }
  for (const path of ['/regions/11/11110/toilet/1-name','/account','/regions/11/30200','/regions/99',
    '//evil.test/regions','https://evil.test/regions','/regions?other=1','/regions/%2F11']) assert.equal(regionNavigationTarget(path), null, path)
})

test('static atlas layouts cover every selectable area and precise boundary assets retain every coordinate', async () => {
  assert.equal(Object.keys(layouts).length, 17)
  for (const province of [null, ...provinces]) {
    const layout = layouts[province?.code ?? 'national']
    assert.deepEqual(layout.areas.map(a => a.code), (province ? districtsIn(province.code) : provinces).map(r => r.code))
    assert.ok(layout.width > 0 && layout.height > 0)
  }
  assert.equal(Object.keys(boundaries).length, allDistricts().length)
  for (const { properties, geometry } of source.features) {
    const asset = boundaries[properties.sgg]
    const body = await readFile(new URL(`../public${asset.href}`, import.meta.url), 'utf8')
    assert.deepEqual(JSON.parse(body), geometry)
    assert.ok(asset.href.includes(createHash('sha256').update(body).digest('hex').slice(0, 12)))
    assert.deepEqual(asset.bounds, regionBounds({ geometry }))
  }
})

class Bucket {
  objects = new Map(); sequence = 0
  async get(key) {
    const record = this.objects.get(key)
    return record ? { etag: String(this.sequence), json: async () => structuredClone(record) } : null
  }
  async put(key, value) { this.objects.set(key, JSON.parse(value)); return { etag: String(++this.sequence) } }
}
const marker = { id: 177, name: '사직주유소', latitude: 37.57, longitude: 126.98,
  translations: { en: { name: 'Sajik station' }, 'zh-cn': { name: '社稷加油站' } } }
const request = (locale = 'ko') => new Request(`https://preview.geupddong.com/api/public/region-markers/11110?locale=${locale}`)
const envFor = bucket => ({ REGION_MARKER_CACHE_ENABLED: 'true', PUBLIC_TOILET_DATA_CACHE_R2: bucket })

test('fresh public markers bypass page rendering and preserve display fallback versus canonical name', async () => {
  const bucket = new Bucket(); let origins = 0
  await readThroughRegionMarkers({ bucket, districtCode: '11110', fetchOrigin: async () => { origins++; return [marker] } })
  for (const locale of ['ko','en','ja','zh-CN','zh-TW','zh-HK']) {
    const response = await regionMarkersResponse(request(locale), envFor(bucket))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('X-Region-Marker-Path'), 'worker')
    assert.match(response.headers.get('Cache-Control'), /no-store/)
    const [item] = (await response.json()).toilets
    assert.equal('translations' in item, false)
    if (locale === 'zh-TW') { assert.equal(item.name, '社稷加油站'); assert.equal(item.canonicalName, '사직주유소') }
  }
  assert.equal(origins, 1)
  await invalidateRegionMarkers(bucket, ['11110'])
  assert.equal(await regionMarkersResponse(request(), envFor(bucket)), null, 'invalidated data goes through the existing loader')
})

test('global invalidation, expiry and generation changes racing a read cannot use the fast path', async () => {
  for (const mode of ['global','expired','race']) {
    const bucket = new Bucket()
    await readThroughRegionMarkers({ bucket, districtCode: '11110', fetchOrigin: async () => [marker] })
    if (mode === 'global') await invalidateRegionMarkers(bucket, null)
    if (mode === 'expired') bucket.objects.get(regionMarkerObjectKey('11110')).storedAt = 1
    if (mode === 'race') {
      const get = bucket.get.bind(bucket); let reads = 0
      bucket.get = async key => { if (key === regionMarkerGlobalKey() && ++reads === 2) bucket.objects.set(key, { schema: 1, revision: 1 }); return get(key) }
    }
    assert.equal(await regionMarkersResponse(request(), envFor(bucket)), null, mode)
  }
})

test('unrelated routes, unsupported input and R2 failure safely fall through or reject', async () => {
  const env = envFor({ get: async () => { throw new Error('R2 down') } })
  assert.equal(await regionMarkersResponse(new Request('https://example.com/api/auth/me'), env), null)
  assert.equal((await regionMarkersResponse(request('unsupported'), env)).status, 400)
  assert.equal(await regionMarkersResponse(request(), env), null)
})
