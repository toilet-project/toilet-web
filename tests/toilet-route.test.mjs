import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { parseToiletId, toiletPath, toiletCoordinates, regionLabel } from '../src/lib/toiletRoute.ts'

test('detail IDs reject malformed, unsafe, negative and leading-zero values', () => {
  for (const id of ['0', '-1', '01', 'abc', '1.5', '9007199254740992', '../1', '']) assert.equal(parseToiletId(id), null)
  assert.equal(parseToiletId('170'), 170)
  assert.equal(toiletPath(170), '/toilet/170')
  assert.throws(() => toiletPath(-1))
})
test('missing or invalid coordinates never become a fabricated map pin', () => {
  for (const detail of [null, {}, {latitude:null,longitude:null}, {latitude:91,longitude:127}, {latitude:'37',longitude:127}]) assert.equal(toiletCoordinates(detail), null)
  assert.deepEqual(toiletCoordinates({latitude:36.35,longitude:127.38}), {latitude:36.35,longitude:127.38})
})
test('verified city/district hierarchy does not duplicate names or parse source address', () => {
  assert.equal(regionLabel({sidoName:'충청남도',sigunguName:'천안시 서북구',cityName:'천안시',districtName:'서북구'}),'충청남도 천안시 서북구')
  assert.equal(regionLabel({sidoName:'세종특별자치시',sigunguName:null}),'세종특별자치시')
  assert.equal(regionLabel(null),'')
})
test('interactive detail fetch does not wait for the route; initial SSR still seeds the cache', async () => {
  const app = await readFile(new URL('../src/App.tsx',import.meta.url),'utf8')
  assert.match(app,/fetchToiletDetail\(activeDetailId, controller.signal\)/)
  assert.match(app,/if \(route.detail\) cache.set\(route.detail\)/)
  assert.match(app,/disposed = true; controller.abort\(\)/)
  assert.match(app,/onNavigate\(toiletId\)/)
  assert.match(app,/if \(!disposed && !initialRouteRef.current.detail\)/)
})

test('unknown detail values use placeholders and collapsed mobile errors remain visible', async () => {
  const app = await readFile(new URL('../src/App.tsx',import.meta.url),'utf8')
  const css = await readFile(new URL('../src/App.css',import.meta.url),'utf8')
  assert.match(app,/selectedToilet.toiletType \|\| '화장실'/)
  assert.match(app,/!toiletDetail && isDetailLoading && <DetailLoadingFields/)
  assert.match(app,/role="status" aria-label="주소와 시설 정보 불러오는 중"/)
  assert.match(css,/\.place-card:not\(\.mobile-card-expanded\) \.detail-error\s*\{\s*display: block;/)
})
