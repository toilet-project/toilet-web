import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readReviewTestToilet, REVIEW_TEST_TOILET_ID } from '../src/lib/reviewTestToilet.ts'

const hash = '#review-test=36.3504,127.3845' // Public city-hall coordinate, not a user's address.
test('test facility requires both a preview build and an explicit valid fragment', () => {
  assert.equal(readReviewTestToilet(hash, false), null)
  for (const value of ['', '#review-test=', '#review-test=,', '#review-test=91,1', '#review-test=1,-181',
    '#review-test=NaN,1', '#review-test=1,Infinity', '#review-test=1e1,1', '#review-test=1,2&admin=true',
    '#review-test=1,2,3', '#review-test=<script>,2', '#review-test=1.123456789,2', 'x'.repeat(200)]) {
    assert.equal(readReviewTestToilet(value, true), null, value)
  }
  const item = readReviewTestToilet(hash, true)
  assert.equal(item.id, REVIEW_TEST_TOILET_ID)
  assert.ok(item.id < 0)
  assert.equal(item.latitude, 36.3504)
  assert.equal(item.longitude, 127.3845)
  assert.match(item.toiletType, /실제 시설 아님/)
  assert.equal(item.roadAddress, '')
  assert.ok(readReviewTestToilet('#review-test=-90,-180', true))
})

test('fixture is isolated from business data and cannot bypass session or GPS eligibility', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /activeDetailId === testToilet\?\.id \|\| detailCache/)
  assert.match(app, /toiletId === testToilet\?\.id \? testToilet : detailCache/)
  assert.match(app, /if \(toiletId === testToilet\?\.id\) onNavigate\(null\)\s+else onNavigate\(toiletId\)/)
  assert.match(app, /if \(target.toilet.id < 0\) return/)
  assert.match(app, /onReview=\{REVIEW_DESIGN_PREVIEW && toiletDetail \? \(\) => reviewPreview.open\(toiletDetail\)/)
  const fixture = readFileSync(new URL('../src/lib/reviewTestToilet.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(fixture, /fetch\(|localStorage|sessionStorage|geolocation|getCurrentPosition/)
})
