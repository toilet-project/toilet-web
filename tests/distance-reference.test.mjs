import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolveDistanceReference } from '../src/lib/distanceReference.ts'

const searched = {latitude:36.332,longitude:127.434}
const gps = {latitude:36.35,longitude:127.38}
test('search/manual reference takes precedence over an existing GPS fix', () => {
  assert.deepEqual(resolveDistanceReference('point', searched, gps), searched)
})
test('GPS updates cannot overwrite the selected search reference', () => {
  assert.deepEqual(resolveDistanceReference('point', searched, {latitude:37,longitude:128}), searched)
})
test('current-location mode uses the latest GPS fix', () => {
  assert.deepEqual(resolveDistanceReference('current-location', searched, gps), gps)
})
test('search and initial references work without location permission', () => {
  assert.deepEqual(resolveDistanceReference('point', searched, null), searched)
})
test('GPS mode without a fix has a defined fallback', () => {
  assert.deepEqual(resolveDistanceReference('current-location', searched, null), searched)
})
test('GPS hides reference overlay and single-card address lives in details first', async () => {
  const app = await readFile(new URL('../src/App.tsx',import.meta.url),'utf8')
  const details = await readFile(new URL('../src/components/ToiletDetailContents.tsx',import.meta.url),'utf8')
  assert.match(app, /if \(source === 'current-location'\) return/)
  assert.match(app, /updateReferencePoint\(coordinates, 'current-location'\)/)
  assert.doesNotMatch(app, /isDesktop \? mapCenter : currentLocation|className="summary-address"/)
  assert.ok(details.indexOf('className="detail-address"') < details.indexOf('label="지역"'))
})
