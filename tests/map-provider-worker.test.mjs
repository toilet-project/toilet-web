import assert from 'node:assert/strict'
import test from 'node:test'
import { mapProviderConfigResponse } from '../map-provider-worker.mjs'

test('map provider config ignores unrelated routes', () => {
  assert.equal(mapProviderConfigResponse(new Request('https://preview.geupddong.com/'), {}), null)
})

test('map provider config is GET-only and fail-closed', async () => {
  const post = mapProviderConfigResponse(new Request('https://preview.geupddong.com/api/map-provider-config', { method: 'POST' }), {})
  assert.equal(post.status, 405)
  assert.equal(post.headers.get('allow'), 'GET')

  const disabled = mapProviderConfigResponse(new Request('https://preview.geupddong.com/api/map-provider-config'), {
    NAVER_MAP_ENABLED: 'false',
    NAVER_MAP_CLIENT_ID: 'not-returned',
  })
  assert.equal(disabled.status, 503)
  assert.deepEqual(await disabled.json(), { error: 'map_unavailable' })
})

test('preview returns only the public Naver browser client id without caching', async () => {
  const response = mapProviderConfigResponse(new Request('https://preview.geupddong.com/api/map-provider-config'), {
    NAVER_MAP_ENABLED: 'true',
    NAVER_MAP_CLIENT_ID: 'public-browser-id',
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { provider: 'naver', clientId: 'public-browser-id' })
})
