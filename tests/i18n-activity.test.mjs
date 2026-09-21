import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { messages, message } from '../src/i18n/messages.ts'
import { historyDateLabel, historyRange, historyRangeProblem, historyToday, selectHistory } from '../src/lib/history.ts'
import { calendarDayLabel } from '../src/lib/historyCalendar.ts'
import { validateReview, blankReview, waitLabel, canManageReview } from '../src/lib/review.ts'
import { reportReadErrorMessage } from '../src/lib/report-error.ts'
import { ReviewApiError } from '../src/lib/reviewApi.ts'
import { ReviewGateError, reviewLocationProblem } from '../src/lib/reviewLocation.ts'
import { reviewErrorMessage } from '../src/i18n/reviewErrors.ts'
import { sanitizeAnalyticsPagePath } from '../src/lib/analytics.ts'

test('UI dictionaries retain equal interpolation fields, with no unresolved copies', () => {
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()
  for (const key of Object.keys(messages.ko)) assert.deepEqual(placeholders(messages.ko[key]), placeholders(messages.en[key]), key)
  assert.equal(message('en', 'history.lastDays', { days: 7 }), 'Last 7 days')
  assert.equal(message('ko', 'history.lastDays', { days: 7 }), '최근 7일')
  assert.equal(message('en', 'history.close', { title: '$& <test> {days}' }), 'Close $& <test> {days}')
})

test('English presentation never changes the Korea-date range or seven-day edit boundary', () => {
  const instant = Date.parse('2026-09-18T15:30:00Z')
  assert.equal(historyToday(instant), '2026-09-19')
  assert.deepEqual(historyRange('7', historyToday(instant)), { period: '7', from: '2026-09-13', to: '2026-09-19' })
  for (const locale of ['ko', 'en']) {
    assert.equal(historyDateLabel('2026-09-19T00:30:00', locale), historyDateLabel('2026-09-18T15:30:00Z', locale))
    assert.equal(historyRangeProblem('2026-09-19', '2026-09-19', '2026-09-19', locale), null)
    assert.ok(historyRangeProblem('2026-09-19', '2026-09-18', '2026-09-19', locale))
    assert.ok(historyRangeProblem('2026-09-19', '2026-09-20', '2026-09-19', locale))
  }
  assert.equal(calendarDayLabel('2026-09-19', 'en'), 'September 19, 2026')
  assert.equal(calendarDayLabel('2026-09-19'), '2026년 9월 19일')
  assert.equal(selectHistory([{ createdAt: '2026-09-18T15:30:00Z' }], { period: 'custom', from: '2026-09-19', to: '2026-09-19' }).length, 1)
  const review = { createdAt: new Date(instant).toISOString(), authorRemoved: false }
  assert.equal(canManageReview(review, instant + 7 * 86400000 - 1), true)
  assert.equal(canManageReview(review, instant + 7 * 86400000), false)
})

test('review validation changes copy only, not ratings, text, waiting or distance rules', () => {
  const valid = { satisfaction: 4, cleanliness: 5, paper: true, waitMinutes: 30, comment: '원문🙂'.repeat(60) }
  const original = structuredClone(valid)
  for (const locale of ['ko', 'en']) {
    assert.equal(validateReview(valid, locale), null)
    for (const input of [blankReview(), { ...valid, cleanliness: 3.5 }, { ...valid, paper: null }, { ...valid, waitMinutes: 61 }, { ...valid, waitMinutes: 5 }, { ...valid, comment: '🙂'.repeat(201) }]) assert.ok(validateReview(input, locale))
  }
  assert.deepEqual(valid, original)
  assert.equal(waitLabel(60, 'en'), '1 hour or more')
  assert.equal(waitLabel(30, 'en'), '30 min')
  assert.equal(waitLabel(30), '30분')
  const coords = { latitude: 36.35, longitude: 127.38, accuracy: 50 }, now = Date.now()
  assert.equal(reviewLocationProblem(coords, { coords, timestamp: now - 300000 }, now), null)
  assert.ok(reviewLocationProblem(coords, { coords: { ...coords, accuracy: 50.1 }, timestamp: now }, now))
  assert.ok(reviewLocationProblem(coords, { coords, timestamp: now - 300001 }, now))
})

test('review and report failures have actionable English without exposing unknown server details', () => {
  assert.match(reviewErrorMessage(new ReviewGateError('리뷰는 화장실 150m 이내에서 가능해요.', 'distance'), 'en'), /150 m/)
  assert.match(reviewErrorMessage(new ReviewApiError('REVIEW_EDIT_EXPIRED', '임의'), 'en'), /7-day/)
  assert.match(reviewErrorMessage(new ReviewApiError('REVIEW_ALREADY_EXISTS', '임의'), 'en'), /24 hours/)
  assert.match(reviewErrorMessage(new ReviewGateError('작성 후 7일이 지나 수정할 수 없어요.'), 'en'), /7-day/)
  assert.match(reviewErrorMessage(new ReviewGateError('리뷰를 쓰려면 현재 위치 권한을 허용해 주세요.'), 'en'), /Allow location/)
  for (const error of [new Error('secret'), new ReviewApiError('unknown', 'secret'), new ReviewApiError('__proto__', 'secret'), new ReviewGateError('secret'), new ReviewGateError('__proto__')]) {
    assert.equal(typeof reviewErrorMessage(error, 'en'), 'string')
    assert.doesNotMatch(reviewErrorMessage(error, 'en'), /secret/)
  }
  assert.match(reportReadErrorMessage(new TypeError('private'), 'en'), /internet/)
  assert.doesNotMatch(reportReadErrorMessage(new Error('private'), 'en'), /private/)
})

test('activity views keep authors, comments, addresses and administrator notes verbatim', () => {
  const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
  const mine = read('components/reviews/MyReviewsPanel.tsx'), reports = read('components/MyReportsPanel.tsx'), notices = read('components/NotificationPanel.tsx')
  for (const source of [mine, reports, notices]) assert.doesNotMatch(source, /translate\(|translation.googleapis/)
  assert.match(mine, /item.comment \|\| t\('review.noComment'\)/)
  assert.match(reports, /<dd>\{report.reason\}<\/dd>/)
  assert.match(reports, /report.reviewNote\?\.trim\(\)/)
  assert.match(notices, /<span>\{item.message\}<\/span>/)
  assert.match(notices, /item.referenceType === 'TOILET_REPORT'/)
  assert.match(notices, /t\('content.original'\)/)
  assert.match(message('en', 'review.detachDetails'), /written text will not be deleted/)
  assert.match(message('en', 'review.detachWarning'), /cannot be edited or linked back/)
})

test('analytics integration preserves the new strict allowlist for English routes too', () => {
  assert.equal(sanitizeAnalyticsPagePath('/en/toilet/123?secret=x'), '/toilet/:id')
  assert.equal(sanitizeAnalyticsPagePath('/en/policies/privacy'), '/policies/privacy')
  for (const path of ['/en/admin-toilets-preview', '/en/private-user', '/en/review-verification/123']) assert.equal(sanitizeAnalyticsPagePath(path), '/other')
})
