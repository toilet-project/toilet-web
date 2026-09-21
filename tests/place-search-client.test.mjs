import assert from 'node:assert/strict'
import test from 'node:test'

const { searchCloudflarePlaces } = await import('../src/api/placeSearch.ts')

test('sends the selected Asian locale without downloading the whole search index', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    return Response.json({ results: [{ id: 'Q20415', name: 'ソウル駅', latitude: 37.55, longitude: 126.97 }] })
  }
  try {
    assert.deepEqual((await searchCloudflarePlaces('ソウル', 'ja')).map(place => place.name), ['ソウル駅'])
    assert.equal(calls[0].url, '/api/place-search')
    assert.deepEqual(JSON.parse(calls[0].options.body), { locale: 'ja', query: 'ソウル' })
    assert.equal(calls[0].options.cache, 'no-store')
  } finally {
    globalThis.fetch = originalFetch
  }
})
