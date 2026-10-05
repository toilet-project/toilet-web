import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { toiletCoordinates, toiletPath } from '../src/lib/toiletRoute.ts'
import { localizedPublicPath } from '../src/i18n/routes.ts'

const source = path => readFile(new URL(path, import.meta.url), 'utf8')

test('liked rows keep localized map detail routes as the desktop fallback', async () => {
  const panel = await source('../src/components/LikedToiletsPanel.tsx')
  assert.match(panel, /onSelect=\{\(\) => onOpenToilet \? onOpenToilet\(item\) : router.push\(localizedPublicPath\(toiletPath\(item.id\), locale\)!, \{ scroll: false \}\)\}/)
  for (const locale of ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK']) {
    const path = localizedPublicPath(toiletPath(42), locale)
    assert.ok(path.endsWith('/toilet/42'))
    assert.ok(!path.includes('tab=account'))
  }
})

test('mobile liked rows switch to the map and explicitly focus the selected restroom', async () => {
  const app = await source('../src/App.tsx')
  const mobile = await source('../src/components/MobilePage.tsx')
  assert.match(mobile, /onOpenToilet=\{onOpenLikedToilet\}/)
  assert.match(app, /onOpenLikedToilet=\{openLikedToilet\}/)
  const open = app.slice(app.indexOf('const openLikedToilet ='), app.indexOf('\n  return (', app.indexOf('const openLikedToilet =')))
  assert.match(open, /setMobileTab\('map'\)/)
  assert.match(open, /selectToilet\(item.id, item.name/)
  assert.match(open, /!isMapReady \|\| !map/)
  assert.match(open, /requestAnimationFrame/)
  assert.match(open, /map.relayout\(\)/)
  assert.match(open, /map.panTo\(createMapCoordinate\(map, point.latitude, point.longitude\)\)/)
  assert.match(open, /setIsMobileCardExpanded\(true\)/)
})

test('unlike is a separate sibling action, never a row navigation', async () => {
  const panel = await source('../src/components/LikedToiletsPanel.tsx')
  assert.match(panel, /<article key=\{item.id\} className="liked-row"><ToiletListItem/)
  assert.match(panel, /onClick=\{\(\) => unlike\(item.id\)\}/)
  assert.doesNotMatch(panel, /<article[^>]*onClick/)
})

test('liked restroom coordinates must be valid before focusing the map', () => {
  assert.deepEqual(toiletCoordinates({ latitude: 36.3, longitude: 127.3 }), { latitude: 36.3, longitude: 127.3 })
  for (const point of [null, { latitude: null, longitude: null }, { latitude: NaN, longitude: 127 }, { latitude: 36, longitude: 181 }]) {
    assert.equal(toiletCoordinates(point), null)
  }
})
