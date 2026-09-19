import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const html = readFileSync(new URL('public/admin-toilets-preview/index.html', root), 'utf8')
const script = readFileSync(new URL('public/admin-toilets-preview/toilets.js', root), 'utf8')
const route = readFileSync(new URL('src/app/admin-toilets-preview/map-config/route.ts', root), 'utf8')

test('admin toilet preview is isolated under the fixed preview route', () => {
  assert.match(html, /\/admin-toilets-preview\/toilets\.js/)
  assert.match(html, /id="toilet-search"/)
  assert.match(html, /id="toilet-sido"/)
  assert.match(html, /id="toilet-map-card"/)
  assert.match(script, /https:\/\/api\.geupddong\.com/)
  assert.match(script, /\/admin-toilets-preview\/map-config/)
})

test('preview uses existing real-data reads and blocks production writes', () => {
  assert.match(script, /api\/admin\/v1\/regions\?/)
  assert.match(script, /프리뷰 저장 차단/)
  assert.match(script, /if \(legacyPreview\) return/)
  assert.match(route, /NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY/)
  assert.match(route, /private, no-store/)
})
