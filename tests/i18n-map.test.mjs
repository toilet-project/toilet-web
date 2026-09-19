import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { toiletTypeLabel } from '../src/i18n/facilityLabels.ts'
import { mapSystemNotice, localizeMapLabels } from '../src/i18n/mapLabels.ts'
import { formatOpenTime, formatInstallationDate } from '../src/lib/detailFormatting.ts'
import { message } from '../src/i18n/messages.ts'

test('only exact structured categories translate; unknown labels and free opening hours stay original', () => {
  assert.equal(toiletTypeLabel('공중화장실', 'en'), 'Public toilet')
  for (const value of ['사유 시설 이름', '__proto__', '서울 화장실']) assert.equal(toiletTypeLabel(value, 'en'), value)
  assert.equal(toiletTypeLabel(undefined, 'en'), 'Toilet')
  assert.equal(formatOpenTime({ openTime: '평일 오전 9시', openTimeDetail: '이용 제한 원문' }, 'en'), '평일 오전 9시 · 이용 제한 원문')
  assert.equal(formatOpenTime({}, 'en'), 'Opening hours unavailable')
  assert.equal(formatInstallationDate('202609', 'en'), '2026-09')
  assert.equal(formatInstallationDate('202609'), '2026년 9월')
})
test('system notices have safe English fallbacks without leaking arbitrary server errors', () => {
  assert.equal(mapSystemNotice('검색 결과가 없습니다.', 'en'), 'No places found.')
  for (const value of ['private-error-value', '__proto__']) assert.doesNotMatch(mapSystemNotice(value, 'en'), /private-error-value|__proto__/)
  assert.equal(mapSystemNotice('검색 결과가 없습니다.', 'ko'), '검색 결과가 없습니다.')
})
test('map overlays relabel in place and preserve original named groups', () => {
  const nodes = [
    { dataset: { mapLabel: 'group', mapCount: '2', mapName: '관리자 원문 장소' }, textContent: '원문 표시' },
    { dataset: { mapLabel: 'group', mapCount: '3', mapName: '' }, textContent: '동일 위치 3' },
  ].map(node => ({ ...node, attributes: {}, setAttribute(key, value) { this.attributes[key] = value } }))
  const root = { querySelectorAll: () => nodes }
  localizeMapLabels(root, 'en')
  assert.equal(nodes[0].textContent, '원문 표시')
  assert.equal(nodes[0].attributes['aria-label'], 'View 2 toilets at 관리자 원문 장소')
  assert.equal(nodes[1].textContent, 'Same location 3')
  localizeMapLabels(root, 'ko')
  assert.equal(nodes[1].textContent, '동일 위치 3')
})
test('public review identity is translated only for removed authors; text and anonymous nicknames stay original', () => {
  const source = readFileSync(new URL('../src/components/reviews/PublicReviews.tsx', import.meta.url), 'utf8')
  assert.match(source, /item.authorRemoved \? t\('public.anonymous'\) : item.authorDisplayName/)
  assert.match(source, /className="public-review-comment">\{comment\}/)
  assert.match(source, /timeZone: 'Asia\/Seoul'/)
  assert.equal(message('en', 'public.summary', { rating: '4.5', count: 2 }), 'Overall rating 4.5 out of 5, 2 reviews')
})
test('CI only enables English UI in unindexed preview builds', () => {
  const source = readFileSync(new URL('../.github/workflows/workers-validation.yml', import.meta.url), 'utf8')
  assert.match(source, /ENGLISH_UI_PREVIEW:.*matrix.target == 'preview' && 'true' \|\| 'false'/)
})
