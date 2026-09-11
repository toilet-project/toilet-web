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
  assert.match(app,/if \(!disposed && !initialRouteRef.current.detail && !resume\)/)
})

test('unknown detail values use placeholders and collapsed mobile errors remain visible', async () => {
  const app = await readFile(new URL('../src/App.tsx',import.meta.url),'utf8')
  const css = await readFile(new URL('../src/App.css',import.meta.url),'utf8')
  const loading = await readFile(new URL('../src/components/ToiletCardLoading.tsx',import.meta.url),'utf8')
  assert.match(app,/selectedToilet.toiletType \|\| '화장실'/)
  assert.match(app,/!toiletDetail && isDetailLoading && <DetailLoadingFields/)
  assert.match(loading,/role="status" aria-label="주소와 시설 정보 불러오는 중"/)
  assert.match(css,/\.place-card:not\(\.mobile-card-expanded\) \.detail-error\s*\{\s*display: block;/)
})

test('loading and first HTML retain current card rows and mobile geometry without inventing data', async () => {
  const source = async path => readFile(new URL(path, import.meta.url), 'utf8')
  const app = await source('../src/App.tsx')
  const loading = await source('../src/components/ToiletCardLoading.tsx')
  const bridge = await source('../src/components/ToiletRouteBridge.tsx')
  const css = await source('../src/components/mobile-navigation.css')
  assert.match(app, /isDetailLoading && <LoadingOpenTime \/>/)
  assert.match(app, /<ToiletCommunityRow pendingReport=\{!isDesktop && !toiletDetail\}/)
  assert.match(app, /<LoadingOpenTime \/><ToiletCommunityRow pendingReport=\{Boolean\(onReport\)\} pendingReview=\{pendingReview\} \/><DetailLoadingFields inline \/>/)
  assert.match(loading, /'card-details detail-loading-fields'/)
  assert.match(loading, /'coordinate-inline-address' : 'detail-address'/)
  assert.match(loading, /className="copy-address-button" type="button" disabled/)
  assert.doesNotMatch(loading, /미설치|설치됨|0m/)
  assert.match(bridge, /route-card-stage/)
  assert.match(bridge, /<ToiletCommunityRow pendingReport pendingReview=\{process.env.NEXT_PUBLIC_REVIEW_DESIGN_PREVIEW === 'true'\} \/>/)
  assert.match(bridge, /aria-label="거리 계산 중"/)
  assert.match(css, /\.has-mobile-navigation \.place-card.mobile-card-expanded \{ height: min\(68svh, 500px\); \}/)
  assert.match(css, /\.route-card-stage \.route-preview-card \.card-details \{ display: none; \}/)
})
