import assert from 'node:assert/strict'
import test from 'node:test'
import { changedDistrictIndexNowPaths } from '../src/server/indexNowRegion.ts'
import { regionDirectoryEntries } from '../src/lib/regionDirectory.ts'

const district = '11110'
const first = { id: 177, name: '사직주유소', latitude: 37.575, longitude: 126.968,
  translations: { en: { name: 'Sajik Gas Station', roadAddress: '1 Sajik-ro' } } }
const second = { id: 178, name: '공중화장실', latitude: 37.58, longitude: 126.97 }

test('unchanged rendered directory does not notify for ordering or non-directory marker changes', () => {
  assert.deepEqual(changedDistrictIndexNowPaths(district, [first, second], [
    { ...second, latitude: 37.581, longitude: 126.971 }, first,
  ]), [])
})

test('a translation change also updates traditional-Chinese display fallbacks', () => {
  const paths = changedDistrictIndexNowPaths(district, [first], [{ ...first,
    translations: { en: { name: 'Sajik Service Station', roadAddress: '1 Sajik-ro' } },
  }])
  assert.equal(paths.length, 3)
  assert.ok(paths.some(path => /^\/en\/regions\/seoul-11\/jongno-gu-11110$/.test(path)))
  assert.ok(paths.some(path => path.startsWith('/zh-tw/regions/')))
  assert.ok(paths.some(path => path.startsWith('/zh-hk/regions/')))
})

test('addition and removal notify every language, not other regions', () => {
  for (const [before, after] of [[[], [first]], [[first], []]]) {
    const paths = changedDistrictIndexNowPaths(district, before, after)
    assert.equal(paths.length, 6)
    assert.ok(paths.every(path => path.startsWith('/regions/') || /^\/(en|ja|zh-cn|zh-tw|zh-hk)\/regions\//.test(path)))
    assert.ok(paths.every(path => path.includes('11110')))
  }
})

test('Korean rename leaves an independently translated English directory untouched', () => {
  const paths = changedDistrictIndexNowPaths(district, [first], [{ ...first, name: '새 이름' }])
  assert.equal(paths.length, 5)
  assert.ok(!paths.some(path => path.startsWith('/en/')))
})

test('projection uses the exact localized name and canonical link rendered by the district page', () => {
  const [entry] = regionDirectoryEntries([first], 'en', district)
  assert.equal(entry.name, 'Sajik Gas Station')
  assert.match(entry.href, /^\/en\/regions\/seoul-11\/jongno-gu-11110\/toilet\/177-/)
  assert.throws(() => changedDistrictIndexNowPaths('00000', [], []), /Unknown district/)
})
