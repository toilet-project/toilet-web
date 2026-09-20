import assert from 'node:assert/strict'
import test from 'node:test'

const { placeSearchProvider } = await import('../src/lib/placeSearchProvider.ts')

test('Korean keeps Kakao search while English uses Cloudflare search', () => {
  assert.equal(placeSearchProvider('ko'), 'kakao')
  assert.equal(placeSearchProvider('en'), 'cloudflare')
})
