import assert from 'node:assert/strict'
import test from 'node:test'
import { locationPermissionMessage } from '../src/lib/locationPermission.ts'
import { mapSystemNotice } from '../src/i18n/mapLabels.ts'

test('iPhone Chrome denial explains app location access without claiming to open Settings', () => {
  const text = locationPermissionMessage({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/144.0 Mobile Safari/604.1', platform: 'iPhone', maxTouchPoints: 5 })
  assert.match(text, /위치 서비스 → Chrome/)
  assert.doesNotMatch(text, /주소창|거부되었습니다/)
})

test('iPad desktop-mode and other browsers receive appropriate recovery paths', () => {
  for (const browser of [
    { userAgent: 'Mozilla/5.0 (iPad) Version/18.0 Safari/605.1', platform: 'iPad', maxTouchPoints: 5 },
    { userAgent: 'Mozilla/5.0 (Macintosh) Version/18.0 Safari/605.1', platform: 'MacIntel', maxTouchPoints: 5 },
  ]) assert.match(locationPermissionMessage(browser), /사용 중인 브라우저/)
  for (const browser of [
    { userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/144.0', platform: 'Linux armv8l', maxTouchPoints: 5 },
    { userAgent: 'Mozilla/5.0 (Macintosh) Chrome/144.0', platform: 'MacIntel', maxTouchPoints: 0 },
  ]) assert.match(locationPermissionMessage(browser), /사이트 설정과 기기의 위치 권한/)
})

test('every recovery path has all supported locale translations', () => {
  for (const userAgent of ['iPhone CriOS/144.0', 'iPhone Safari/604.1', 'Android Chrome/144.0']) {
    const text = locationPermissionMessage({ userAgent, platform: '', maxTouchPoints: 0 })
    for (const locale of ['en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK']) {
      const translated = mapSystemNotice(text, locale)
      assert.doesNotMatch(translated, /[가-힣]/)
      assert.notEqual(translated, mapSystemNotice('unrecognized-notice', locale))
      if (userAgent.includes('CriOS')) assert.match(translated, /Chrome/)
    }
  }
})
