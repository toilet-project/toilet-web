import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { blankReview, validateReview, canManageReview, waitLabel, reviewLength } from '../src/lib/review.ts'
import { reviewLocationProblem } from '../src/lib/reviewLocation.ts'

const valid = () => ({ ...blankReview(), satisfaction: 4, cleanliness: 5, paper: true })
test('review requires both ratings and a boolean paper selection, optional fields may be blank', () => {
  assert.notEqual(validateReview(blankReview()), null)
  assert.equal(validateReview(valid()), null)
  assert.equal(validateReview({ ...valid(), paper: false }), null)
  for (const n of [0, 6, NaN, 1.5]) {
    assert.notEqual(validateReview({ ...valid(), satisfaction: n }), null)
    assert.notEqual(validateReview({ ...valid(), cleanliness: n }), null)
  }
  for (const paper of [null, undefined, 'true']) assert.notEqual(validateReview({ ...valid(), paper }), null)
})
test('review waiting slider accepts 0 through 60 in ten-minute steps', () => {
  for (const congestion of ['WAITING', 'CROWDED']) {
    for (let waitMinutes = 0; waitMinutes <= 60; waitMinutes += 10) assert.equal(validateReview({ ...valid(), congestion, waitMinutes }), null)
    for (const waitMinutes of [-1, 5, 61, NaN]) assert.notEqual(validateReview({ ...valid(), congestion, waitMinutes }), null)
  }
  assert.equal(waitLabel(60), '1시간 이상')
  assert.equal(waitLabel(0), '0분')
})
test('review free text limit counts Unicode code points', () => {
  assert.equal(reviewLength('🙂'.repeat(200)), 200)
  assert.equal(validateReview({ ...valid(), comment: '🙂'.repeat(200) }), null)
  assert.notEqual(validateReview({ ...valid(), comment: '🙂'.repeat(201) }), null)
})
test('seven-day boundary uses original creation and detached reviews cannot be managed', () => {
  const created = Date.parse('2026-09-11T00:00:00Z')
  const r = { authorRemoved: false, createdAt: new Date(created).toISOString(), updatedAt: '2099-01-01' }
  assert.equal(canManageReview(r, created), true)
  assert.equal(canManageReview(r, created + 7 * 86400000 - 1), true)
  assert.equal(canManageReview(r, created + 7 * 86400000), false)
  assert.equal(canManageReview(r, created - 1), false)
  assert.equal(canManageReview({ ...r, authorRemoved: true }, created), false)
  assert.equal(canManageReview({ ...r, createdAt: 'invalid' }, created), false)
})
test('design preview is non-indexable, production-gated and does not contact the member or review API', () => {
  const page = readFileSync(new URL('../src/app/review-preview/page.tsx', import.meta.url), 'utf8')
  const ui = readFileSync(new URL('../src/components/reviews/ReviewPreview.tsx', import.meta.url), 'utf8')
  assert.match(page, /SITE_INDEXABLE === 'true'/)
  assert.match(page, /notFound\(\)/)
  assert.match(page, /index: false/)
  assert.doesNotMatch(ui, /\bfetch\s*\(|XMLHttpRequest|navigator\.geolocation|localStorage|sessionStorage/)
  assert.match(ui, /작성자만 ‘탈퇴한 사용자’/)
  assert.match(ui, /급똥 회원 탈퇴는 아닙니다/)
  assert.match(ui, /작성한 글은 삭제되지 않아요/)
})

test('existing map review integration is build-gated and memory-only with account isolation', () => {
  const hook = readFileSync(new URL('../src/components/reviews/useIntegratedReviewPreview.tsx', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const config = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8')
  assert.match(config, /NEXT_PUBLIC_REVIEW_DESIGN_PREVIEW: process.env.SITE_INDEXABLE === 'false' \? 'true' : 'false'/)
  assert.match(hook, /ownerRef.current !== owner/)
  assert.match(hook, /setReviews\(\[\]\)/)
  assert.doesNotMatch(hook, /\bfetch\s*\(|navigator\.geolocation|localStorage|sessionStorage/)
  assert.match(hook, /if \(!owner\) \{ access.requireLogin\(\)/)
  assert.match(hook, /await requireReviewLocation\(next\)/)
  assert.match(hook, /!editing \? await requireReviewLocation\(target\)/)
  assert.match(hook, /access.verifySession\(\)/)
  assert.match(app, /onReview=\{REVIEW_DESIGN_PREVIEW/)
  assert.match(app, /onReviews=\{REVIEW_DESIGN_PREVIEW \? reviewPreview.openMine : undefined\}/)
  assert.match(app, /reviewPreview.active \|\| reportTarget/)
})

test('review location rejects far, inaccurate, stale, invalid and implausibly future measurements', () => {
  const now = 1_800_000_000_000, target = { latitude: 36.35, longitude: 127.35 }
  const fix = { coords: { ...target, accuracy: 50 }, timestamp: now - 60_000 }
  assert.equal(reviewLocationProblem(target, fix, now), null)
  for (const accuracy of [-1, 50.001, NaN, Infinity]) assert.match(reviewLocationProblem(target, { ...fix, coords: { ...fix.coords, accuracy } }, now), /정확도/)
  for (const timestamp of [now - 60_001, now + 5_001, NaN]) assert.match(reviewLocationProblem(target, { ...fix, timestamp }, now), /1분/)
  for (const metres of [149.9, 150.1]) {
    const coords = { ...fix.coords, latitude: target.latitude + metres / 6_371_000 * 180 / Math.PI }
    assert.equal(reviewLocationProblem(target, { ...fix, coords }, now) === null, metres < 150)
  }
  for (const latitude of [null, NaN, 91]) assert.match(reviewLocationProblem({ ...target, latitude }, fix, now), /화장실의 위치/)
})

test('review form uses aligned ten-minute tap targets and integer ratings without preview banner', () => {
  const form = readFileSync(new URL('../src/components/reviews/ReviewDialog.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/components/reviews/reviews.css', import.meta.url), 'utf8')
  assert.match(form, /\[0,10,20,30,40,50,60\]/)
  assert.match(form, /<small>\/ 5<\/small>/)
  assert.doesNotMatch(form, /previewNotice|rv-integrated-notice/)
  assert.match(css, /grid-template-columns: repeat\(7,minmax\(0,1fr\)\)/)
  assert.match(css, /\.rv-dialog:has\(\.rv-required-fields\) \{ height: min\(760px,100%\)/)
})
