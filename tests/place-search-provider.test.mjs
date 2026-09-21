import assert from 'node:assert/strict'
import test from 'node:test'

const { placeSearchProvider } = await import('../src/lib/placeSearchProvider.ts')

test('Korean keeps Kakao search while other locales use the localized Cloudflare index', () => {
  assert.equal(placeSearchProvider('ko'), 'kakao')
  for (const locale of ['en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK']) {
    assert.equal(placeSearchProvider(locale), 'cloudflare')
  }
})
