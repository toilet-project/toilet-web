import assert from 'node:assert/strict'
import test from 'node:test'
import { mapLevelFromNaverZoom, naverZoomFromLevel, resolveMapProvider } from '../src/lib/mapProviderSelection.ts'

test('map selection and search selection can evolve independently', () => {
  assert.equal(resolveMapProvider('ko'), 'kakao')
  assert.equal(resolveMapProvider('en'), 'naver')
  assert.equal(resolveMapProvider('ko', 'naver'), 'naver')
  assert.equal(resolveMapProvider('en', 'kakao'), 'kakao')
})

test('Naver zoom conversion preserves the logical Kakao-compatible level', () => {
  for (const level of [1, 4, 6, 10, 14]) {
    assert.equal(mapLevelFromNaverZoom(naverZoomFromLevel(level)), level)
  }
  assert.equal(naverZoomFromLevel(-10), 21)
  assert.equal(naverZoomFromLevel(100), 5)
})
