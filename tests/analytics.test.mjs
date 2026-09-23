import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildAnalyticsAcquisition,
  resultCountBucket,
  resolveAnalyticsAcquisition,
  sanitizeAnalyticsPagePath,
  sanitizeAnalyticsParameters,
} from '../src/lib/analytics.ts'

test('detail routes and query strings never expose identifiers', () => {
  assert.equal(sanitizeAnalyticsPagePath('/toilet/20243500000100769?source=search'), '/toilet/:id')
  assert.equal(sanitizeAnalyticsPagePath('/toilet/:id'), '/toilet/:id')
  assert.equal(sanitizeAnalyticsPagePath('/policies/privacy#analytics'), '/policies/privacy')
  assert.equal(sanitizeAnalyticsPagePath('/regions'), '/regions')
  assert.equal(sanitizeAnalyticsPagePath('/en/regions/seoul/gangnam-gu'), '/regions')
  assert.equal(sanitizeAnalyticsPagePath('/ja/regions/seoul/gangnam-gu/toilet/123-public'), '/regions/:sido/:district/toilet/:id')
  assert.equal(sanitizeAnalyticsPagePath('/zh-cn/account'), '/account')
  assert.equal(sanitizeAnalyticsPagePath('/profile'), '/other')
  assert.equal(sanitizeAnalyticsPagePath('/review-verification/private-token'), '/other')
})

test('initial acquisition keeps only a referrer host and short UTM dimensions', () => {
  assert.deepEqual(buildAnalyticsAcquisition(
    'https://geupddong.com/?utm_source=Kakao&utm_medium=Social&utm_campaign=private-campaign',
    'https://search.naver.com/search.naver?query=%EB%B9%84%EB%B0%80',
  ), { referrerHost: 'search.naver.com', utmSource: 'kakao', utmMedium: 'social' })
  assert.deepEqual(buildAnalyticsAcquisition('https://geupddong.com/', ''), {
    referrerHost: undefined,
    utmSource: undefined,
    utmMedium: undefined,
  })
})

test('session acquisition stays fixed after an in-app route change', () => {
  const first = buildAnalyticsAcquisition(
    'https://geupddong.com/?utm_source=naver&utm_medium=organic',
    'https://search.naver.com/search.naver?query=private',
  )
  assert.deepEqual(resolveAnalyticsAcquisition(
    JSON.stringify(first),
    'https://geupddong.com/toilet/53585?utm_source=internal',
    'https://geupddong.com/',
  ), first)
  assert.deepEqual(resolveAnalyticsAcquisition(
    '{broken',
    'https://geupddong.com/?utm_source=kakao&utm_medium=social',
    '',
  ), { referrerHost: undefined, utmSource: 'kakao', utmMedium: 'social' })
})

test('event parameters retain only short allowlisted dimensions', () => {
  assert.deepEqual(sanitizeAnalyticsParameters('toilet_search', {
    query_kind: 'ADDRESS',
    success: true,
    result_count_bucket: '2_5',
    keyword: '서울특별시 동대문구 답십리로 223',
    latitude: 37.56,
  }), {
    query_kind: 'address',
    success: true,
    result_count_bucket: '2_5',
  })
})

test('screen views accept only the allowlisted screen parameter', () => {
  assert.deepEqual(sanitizeAnalyticsParameters('screen_view', {
    screen: 'MY_REVIEWS',
    toilet_id: '53585',
  }), { screen: 'my_reviews' })
})

test('result totals use coarse buckets', () => {
  assert.deepEqual([0, 1, 4, 8, 14, 26].map(resultCountBucket), ['0', '1', '2-5', '6-10', '11-25', '26+'])
})
