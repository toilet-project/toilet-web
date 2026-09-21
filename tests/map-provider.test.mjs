import assert from 'node:assert/strict'
import test from 'node:test'
import { mapLevelFromNaverZoom, mapSdkIdentity, naverMapLanguageForLocale, naverMapLanguageNeedsReload, naverZoomFromLevel, resolveMapProvider } from '../src/lib/mapProviderSelection.ts'

test('map selection and search selection can evolve independently', () => {
  assert.equal(resolveMapProvider('ko'), 'kakao')
  assert.equal(resolveMapProvider('en'), 'naver')
  assert.equal(resolveMapProvider('ja'), 'naver')
  assert.equal(resolveMapProvider('zh-CN'), 'naver')
  assert.equal(resolveMapProvider('zh-TW'), 'naver')
  assert.equal(resolveMapProvider('zh-HK'), 'naver')
  assert.equal(resolveMapProvider('ko', 'naver'), 'naver')
  assert.equal(resolveMapProvider('en', 'kakao'), 'kakao')
})

test('Naver map labels follow SDK languages, without conflating Chinese content locales', () => {
  assert.equal(naverMapLanguageForLocale('ko'), 'ko')
  assert.equal(naverMapLanguageForLocale('en'), 'en')
  assert.equal(naverMapLanguageForLocale('ja'), 'ja')
  for (const locale of ['zh-CN', 'zh-TW', 'zh-HK']) assert.equal(naverMapLanguageForLocale(locale), 'zh')
  assert.equal(naverMapLanguageNeedsReload(null, 'ja'), false)
  assert.equal(naverMapLanguageNeedsReload('en', 'ja'), true)
  assert.equal(naverMapLanguageNeedsReload('zh', 'zh'), false)
  assert.equal(mapSdkIdentity('ko'), 'kakao')
  assert.equal(mapSdkIdentity('en'), 'naver:en')
  assert.equal(mapSdkIdentity('ja'), 'naver:ja')
  assert.equal(mapSdkIdentity('zh-CN'), mapSdkIdentity('zh-TW'))
  assert.equal(mapSdkIdentity('zh-TW'), mapSdkIdentity('zh-HK'))
})

test('Naver zoom conversion preserves the logical Kakao-compatible level', () => {
  for (const level of [1, 4, 6, 10, 14]) {
    assert.equal(mapLevelFromNaverZoom(naverZoomFromLevel(level)), level)
  }
  assert.equal(naverZoomFromLevel(-10), 21)
  assert.equal(naverZoomFromLevel(100), 5)
})
