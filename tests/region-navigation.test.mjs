import test from 'node:test'
import assert from 'node:assert/strict'
import { allDistricts, districtAt, getDistrict, getProvince, provinces, regionName, regionPath, regionSnapshot } from '../src/lib/regions.ts'
import { regionContains, districtForToilet } from '../src/lib/regions.ts'
import preciseDistricts from '../data/regions/sgg-precise.json' with { type: 'json' }
import boundaryOverrides from '../data/regions/toilet-boundary-overrides.json' with { type: 'json' }
import { regionToiletPath } from '../src/lib/regionToiletPath.ts'
import { localizedPublicPath, parseLocalizedPublicPath } from '../src/i18n/routes.ts'

test('the current administrative map accounts for every assigned public toilet exactly once', () => {
  assert.equal(provinces.length, 16)
  assert.equal(allDistricts().length, 256)
  assert.ok(getProvince('12'), '2026 Jeonnam–Gwangju is present')
  assert.equal(provinces.reduce((sum, region) => sum + region.count, 0), regionSnapshot.sourceCount - regionSnapshot.unassigned)
  assert.equal(getDistrict('11', '11110')?.count, 194)
  assert.equal(regionName(getDistrict('41', '41111'), 'ko'), '수원시 장안구')
})

test('every mapped district has code-keyed names in all supported languages', () => {
  for (const district of allDistricts()) {
    for (const locale of ['en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK']) {
      const label = regionName(district, locale)
      assert.ok(label && !/[가-힣]/u.test(label), `${district.code} ${locale}: ${label}`)
    }
  }
  assert.equal(regionName(getDistrict('11', '11140'), 'zh-CN'), '中区')
  assert.equal(regionName(getDistrict('41', '41111'), 'en'), 'Jangan-gu, Suwon-si')
})

test('a known point and detail resolve to stable region URLs in every locale', () => {
  assert.equal(districtAt(126.98, 37.57)?.code, '11110')
  const detail = { id: 177, name: '사직주유소', latitude: 37.57, longitude: 126.98 }
  const path = regionToiletPath(detail)
  assert.equal(path, '/regions/11/11110/toilet/177-sajikjuyuso')
  for (const locale of ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK']) {
    const localized = localizedPublicPath(path, locale)
    assert.equal(parseLocalizedPublicPath(localized).path, path)
    assert.equal(parseLocalizedPublicPath(localized).locale, locale)
  }
  assert.equal(regionPath('11', '11110'), '/regions/11/11110')
})

test('facilities outside the current map retain their existing detail URL', () => {
  assert.equal(regionToiletPath({ id: 99, name: '외부', latitude: null, longitude: null }), '/toilet/99')
})

test('precise district assignment corrects a real border facility and its detail URL', () => {
  const longitude = 127.0245747, latitude = 37.5622338
  const precise = preciseDistricts.features.find(feature => feature.properties.sgg === '11140')
  assert.ok(precise)
  assert.equal(districtAt(longitude, latitude)?.code, '11200', 'the light atlas shape assigns this border point to the adjacent district')
  assert.ok(regionContains({ ...getDistrict('11', '11140'), geometry: precise.geometry }, longitude, latitude))
  assert.deepEqual(boundaryOverrides['257'], ['11140', latitude, longitude])
  assert.equal(districtForToilet(257, longitude, latitude)?.code, '11140')
  assert.equal(districtForToilet(257, 126.98, 37.57)?.code, '11110', 'a moved facility must not retain its old correction')
  assert.equal(regionToiletPath({ id: 257, name: '무학봉체육관', latitude, longitude }),
    '/regions/11/11140/toilet/257-muhakbongcheyukgwan')
})

test('the precise dataset and current snapshot cover the same 256 district codes', () => {
  const expected = new Set(allDistricts().map(region => region.code))
  const actual = preciseDistricts.features.map(feature => feature.properties.sgg)
  assert.equal(new Set(actual).size, 256)
  assert.deepEqual(new Set(actual), expected)
  for (const [code] of Object.values(boundaryOverrides)) {
    if (code !== null) assert.ok(expected.has(code), code)
  }
})
