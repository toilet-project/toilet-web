import assert from 'node:assert/strict'
import test from 'node:test'
import { registerHooks } from 'node:module'

// Resolve the extensionless TypeScript imports used by the browser bundle.
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
const fixtureBase = 'https://preview.geupddong.com/__review-verification'
process.env.NEXT_PUBLIC_API_BASE_URL = fixtureBase
const { fetchToiletDetail } = await import('../src/api/toilets.ts')
hooks.deregister()

test('map details use the public cache route, preserve translations and omit visitor credentials', async t => {
  process.env.NEXT_PUBLIC_REVIEW_API_ENABLED = 'false'
  const detail = { id: 42, name: '화장실', translations: {
    en: { name: 'Restroom', roadAddress: 'Road', jibunAddress: null },
    ja: { name: 'トイレ', roadAddress: null, jibunAddress: null },
  }, normalizedOpeningHours: { openingPolicy: 'ALWAYS', open24h: true } }
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return Response.json(detail)
  })
  const signal = new AbortController().signal
  assert.deepEqual(await fetchToiletDetail(42, signal), detail)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/public/toilets/42')
  assert.equal(calls[0].options.signal, signal)
  assert.equal(calls[0].options.credentials, 'omit')
  assert.equal(calls[0].options.cache, 'no-store')
})

test('a missing facility or cache failure never retries against the mini PC', async t => {
  process.env.NEXT_PUBLIC_REVIEW_API_ENABLED = 'false'
  for (const status of [404, 503]) {
    const requests = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status }))
    await assert.rejects(fetchToiletDetail(42), new RegExp(String(status)))
    assert.equal(requests.mock.callCount(), 1)
    requests.mock.restore()
  }
  const requests = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('network unavailable') })
  await assert.rejects(fetchToiletDetail(42), /network unavailable/)
  assert.equal(requests.mock.callCount(), 1)
})

test('selection cancellation and mismatched facilities cannot display the wrong detail', async t => {
  process.env.NEXT_PUBLIC_REVIEW_API_ENABLED = 'false'
  const controller = new AbortController()
  controller.abort()
  const requests = t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    signal.throwIfAborted()
  })
  await assert.rejects(fetchToiletDetail(42, controller.signal), { name: 'AbortError' })
  assert.equal(requests.mock.callCount(), 1)
  requests.mock.restore()
  t.mock.method(globalThis, 'fetch', async () => Response.json({ id: 43, name: '다른 화장실' }))
  await assert.rejects(fetchToiletDetail(42), /상세 응답/)
})

test('explicit synthetic review verification stays outside the real shared cache', async t => {
  process.env.NEXT_PUBLIC_REVIEW_API_ENABLED = 'true'
  const requests = t.mock.method(globalThis, 'fetch', async () => Response.json({ id: 42, name: 'Synthetic' }))
  assert.equal((await fetchToiletDetail(42)).name, 'Synthetic')
  assert.equal(requests.mock.calls[0].arguments[0], `${fixtureBase}/api/v1/toilets/42`)
  process.env.NEXT_PUBLIC_REVIEW_API_ENABLED = 'false'
})
