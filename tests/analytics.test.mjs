import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resultCountBucket,
  sanitizeAnalyticsPagePath,
  sanitizeAnalyticsParameters,
} from '../src/lib/analytics.ts'

test('detail routes and query strings never expose identifiers', () => {
  assert.equal(sanitizeAnalyticsPagePath('/toilet/20243500000100769?source=search'), '/toilet/[id]')
  assert.equal(sanitizeAnalyticsPagePath('/policies/privacy#analytics'), '/policies/privacy')
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

test('result totals use coarse buckets', () => {
  assert.deepEqual([0, 1, 4, 8, 14].map(resultCountBucket), ['0', '1', '2_5', '6_10', '11_plus'])
})
