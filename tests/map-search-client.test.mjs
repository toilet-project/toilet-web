import assert from 'node:assert/strict'
import test from 'node:test'
import { registerHooks } from 'node:module'

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context) }
    catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.'))
        return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  },
})
process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.test'
process.env.NEXT_PUBLIC_MAP_CELL_CACHE_ENABLED = 'true'
process.env.NEXT_PUBLIC_MAP_CLUSTER_CACHE_ENABLED = 'true'
const { fetchToiletsInBounds } = await import('../src/api/toilets.ts')
hooks.deregister()

const params = { southLat: 37.51, northLat: 37.54, westLng: 127.01, eastLng: 127.04,
  zoom: 6, includeList: true }
const payload = { meta: { map_level: 6, display_type: 'MARKER', total_count: 0, result_count: 0 }, toilets: [], clusters: [] }

test('a map-area network failure followed by an origin error never repeats the same fallback', async t => {
  const controller = new AbortController()
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(url)
    assert.equal(options.signal, controller.signal)
    if (calls.length === 1) throw new TypeError('map-area unavailable')
    return new Response(null, { status: 503 })
  })
  await assert.rejects(fetchToiletsInBounds(params, controller.signal), /503/)
  assert.equal(calls.length, 2)
  assert.match(calls[0], /^\/api\/map-area\?/)
  assert.match(calls[1], /^https:\/\/api\.example\.test\/api\/v1\/toilets\?/)
})

test('map-area fallback still returns a successful legacy response after network or HTTP failures', async t => {
  for (const failure of ['network', 404, 503]) {
    const calls = []
    const mock = t.mock.method(globalThis, 'fetch', async url => {
      calls.push(url)
      if (calls.length > 1) return Response.json(payload)
      if (failure === 'network') throw new TypeError('map-area unavailable')
      return new Response(null, { status: failure })
    })
    assert.deepEqual(await fetchToiletsInBounds(params), payload)
    assert.equal(calls.length, 2)
    mock.mock.restore()
  }
})

test('cluster errors keep their origin-stampede boundary and only missing routes fall back', async t => {
  const input = { ...params, zoom: 10, includeList: false }
  for (const status of [404, 403, 503, 'network']) {
    const calls = []
    const mock = t.mock.method(globalThis, 'fetch', async url => {
      calls.push(url)
      if (calls.length > 1) return Response.json(payload)
      if (status === 'network') throw new TypeError('cluster unavailable')
      return new Response(null, { status })
    })
    if (status === 404) assert.deepEqual(await fetchToiletsInBounds(input), payload)
    else await assert.rejects(fetchToiletsInBounds(input))
    assert.equal(calls.length, status === 404 ? 2 : 1)
    assert.match(calls[0], /^\/api\/map-clusters\?/)
    mock.mock.restore()
  }
})

test('direct and filtered lookups never gain an extra origin retry', async t => {
  for (const input of [{ ...params, zoom: 4 }, { ...params, filterFlags: 16 }, { ...params, likedIds: [1] }]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }))
    await assert.rejects(fetchToiletsInBounds(input), /503/)
    assert.equal(mock.mock.callCount(), 1)
    mock.mock.restore()
  }
})

test('cancellation propagates before and during fallback without further requests', async t => {
  for (const stage of ['initial', 'fallback']) {
    const controller = new AbortController()
    let calls = 0
    const mock = t.mock.method(globalThis, 'fetch', async (_url, options) => {
      calls++
      assert.equal(options.signal, controller.signal)
      if (stage === 'initial' || calls === 2) {
        controller.abort()
        options.signal.throwIfAborted()
      }
      throw new TypeError('map-area unavailable')
    })
    await assert.rejects(fetchToiletsInBounds(params, controller.signal), { name: 'AbortError' })
    assert.equal(calls, stage === 'initial' ? 1 : 2)
    mock.mock.restore()
  }
})
