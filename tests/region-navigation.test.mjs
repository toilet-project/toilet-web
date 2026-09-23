import test from 'node:test'
import assert from 'node:assert/strict'
import { allDistricts, districtAt, getDistrict, getProvince, localizedRegionPath, provinces, regionName, regionPath, regionSnapshot } from '../src/lib/regions.ts'
import { regionContains, districtForToilet } from '../src/lib/regions.ts'
import preciseDistricts from '../data/regions/sgg-precise.json' with { type: 'json' }
import boundaryOverrides from '../data/regions/toilet-boundary-overrides.json' with { type: 'json' }
import toiletDistrict from '../data/regions/toilet-district.json' with { type: 'json' }
import toiletDistrictCodes from '../data/regions/toilet-district-codes.json' with { type: 'json' }
import { parseRegionToiletSegment, regionToiletPath, regionToiletPathForDistrict } from '../src/lib/regionToiletPath.ts'
import { codeFromRegionSegment, decodedRouteSegment } from '../src/lib/urlName.ts'
import { isMapPath, localizedPublicPath, parseLocalizedPublicPath } from '../src/i18n/routes.ts'

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
  assert.equal(regionName(getProvince('11'), 'zh-CN'), '首尔')
  assert.equal(regionName(getProvince('11'), 'zh-TW'), '首爾')
  assert.equal(regionName(getProvince('11'), 'zh-HK'), '首爾')
  assert.equal(regionName(getProvince('47'), 'zh-HK'), '慶尚北道')
  assert.equal(regionName(getProvince('50'), 'zh-TW'), '濟州')
  assert.equal(regionName(getDistrict('41', '41111'), 'en'), 'Jangan-gu, Suwon-si')
})

test('a known point and detail resolve to stable region URLs in every locale', () => {
  assert.equal(districtAt(126.98, 37.57)?.code, '11110')
  const detail = { id: 177, name: '사직주유소', latitude: 37.57, longitude: 126.98,
    translations: { en: { name: 'Sajik gas station' }, ja: { name: 'サジク給油所' }, 'zh-CN': { name: '社稷加油站' } } }
  const path = regionToiletPath(detail)
  assert.equal(path, '/regions/서울특별시-11/종로구-11110/toilet/177-사직주유소')
  assert.equal(regionToiletPath(detail, 'en'), '/regions/seoul-11/jongno-gu-11110/toilet/177-sajik-gas-station')
  assert.equal(regionToiletPath(detail, 'ja'), '/regions/ソウル-11/鍾路区-11110/toilet/177-サジク給油所')
  assert.equal(regionToiletPath(detail, 'zh-CN'), '/regions/首尔-11/钟路区-11110/toilet/177-社稷加油站')
  assert.equal(regionToiletPath(detail, 'zh-TW'), '/regions/首爾-11/鐘路區-11110/toilet/177-사직주유소', 'temporary display fallback must not change a permanent URL')
  assert.equal(regionToiletPath(detail, 'zh-HK'), '/regions/首爾-11/鐘路區-11110/toilet/177-사직주유소')
  assert.equal(regionToiletPath({ ...detail, translations: { ...detail.translations, 'zh-TW': { name: '繁體名稱' } } }, 'zh-TW'),
    '/regions/首爾-11/鐘路區-11110/toilet/177-繁體名稱')
  assert.equal(regionToiletPathForDistrict(detail, 'zh-CN', '11110'),
    '/regions/首尔-11/钟路区-11110/toilet/177-社稷加油站', 'snapshot paths avoid per-entry polygon scans')
  assert.equal(regionToiletPathForDistrict(detail, 'zh-CN', '99999'), '/toilet/177')
  for (const locale of ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK']) {
    const localized = localizedPublicPath(regionToiletPath(detail, locale), locale)
    assert.equal(parseLocalizedPublicPath(localized).path, regionToiletPath(detail, locale))
    assert.equal(parseLocalizedPublicPath(localized).locale, locale)
    assert.equal(parseLocalizedPublicPath(encodeURI(localized)).path, regionToiletPath(detail, locale))
    assert.equal(isMapPath(encodeURI(localized)), true)
  }
  assert.equal(regionPath('11', '11110'), '/regions/11/11110')
  assert.equal(localizedRegionPath('ko', '11', '11110'), '/regions/서울특별시-11/종로구-11110')
  assert.equal(localizedRegionPath('en', '11', '11110'), '/regions/seoul-11/jongno-gu-11110')
  assert.equal(codeFromRegionSegment('서울특별시-11', 2), '11')
  assert.equal(decodedRouteSegment(encodeURIComponent('서울특별시-11')), '서울특별시-11')
  assert.equal(decodedRouteSegment('서울특별시%2F11'), null)
  assert.equal(codeFromRegionSegment('11110', 5), '11110')
  assert.equal(codeFromRegionSegment('서울특별시-11110', 2), null)
  assert.equal(parseRegionToiletSegment('177-サジク給油所'), 177)
  assert.equal(parseRegionToiletSegment('177-sajikjuyuso'), 177, 'legacy slugs remain redirectable')
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
    '/regions/서울특별시-11/중구-11140/toilet/257-무학봉체육관')
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

test('the compact sitemap district projection matches the release snapshot', () => {
  for (const [id, [code]] of Object.entries(toiletDistrict)) assert.equal(toiletDistrictCodes[Number(id)], code, id)
  assert.equal(toiletDistrictCodes[1], '11110')
})
