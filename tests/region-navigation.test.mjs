import test from 'node:test'
import assert from 'node:assert/strict'
import { allDistricts, districtAt, getDistrict, getProvince, provinces, regionName, regionPath, regionSnapshot } from '../src/lib/regions.ts'
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
