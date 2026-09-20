import assert from 'node:assert/strict'
import test from 'node:test'
import { placeSearchCategory } from '../scripts/place-search-category.mjs'

test('uses a specific bilingual category before the broad search group', () => {
  assert.deepEqual(placeSearchCategory({ category: 'transport', classification: { labels: ['international airport'] } }), {
    code: 'airport', ko: '공항', en: 'Airport',
  })
  assert.deepEqual(placeSearchCategory({ category: 'nature', classification: { labels: ['urban park'] } }), {
    code: 'park', ko: '공원', en: 'Park',
  })
})

test('falls back to the reviewed broad category when no detail rule matches', () => {
  assert.deepEqual(placeSearchCategory({ category: 'heritage', classification: { labels: [] } }), {
    code: 'heritage', ko: '명소·문화', en: 'Landmark & culture',
  })
})
