import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { GET } from '../src/app/location-check/route.ts'

async function response(indexable, origin = 'https://preview.geupddong.com') {
  const previous = process.env.SITE_INDEXABLE
  try {
    if (indexable === undefined) delete process.env.SITE_INDEXABLE
    else process.env.SITE_INDEXABLE = indexable
    return GET(new Request(`${origin}/location-check`))
  } finally {
    if (previous === undefined) delete process.env.SITE_INDEXABLE
    else process.env.SITE_INDEXABLE = previous
  }
}

test('location check fails closed in production, unknown environments and other hosts', async () => {
  for (const indexable of ['true', undefined, '']) assert.equal((await response(indexable)).status, 404)
  assert.equal((await response('false', 'https://geupddong.com')).status, 404)
  const preview = await response('false')
  assert.equal(preview.status, 200)
  assert.match(preview.headers.get('cache-control'), /no-store/)
  assert.match(preview.headers.get('content-security-policy'), /connect-src 'none'/)
  assert.match(preview.headers.get('x-robots-tag'), /noindex/)
  const html = await preview.text()
  assert.doesNotMatch(html, /<script[^>]+src=|<iframe|\/api\//)
})

async function probe() {
  const html = await (await response('false')).text()
  const nodes = new Map(), timers = new Map(), calls = []
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', addEventListener(event, fn) { this[event] = fn } })
    return nodes.get(id)
  }
  let success, error, id = 0
  const context = {
    navigator: { userAgent: 'iPhone CriOS/test', userActivation: { isActive: true },
      geolocation: { getCurrentPosition(ok, fail) { calls.push('native'); success = ok; error = fail } },
      permissions: { query() { calls.push('query'); return new Promise(() => {}) } },
    },
    document: { visibilityState: 'visible', getElementById: node, permissionsPolicy: { allowsFeature: () => true } },
    isSecureContext: true, performance: { now: () => 0 },
    setTimeout(fn) { const key = ++id; timers.set(key, fn); return key },
    clearTimeout(key) { timers.delete(key) },
  }
  context.window = { top: null }; context.window.top = context.window
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context)
  return { calls, node, click: () => node('request').click(), success: p => success(p), error: e => error(e),
    deadline: () => { for (const fn of timers.values()) fn() }, state: () => JSON.parse(node('report').textContent) }
}

test('a click reaches the native request before any advisory query, with no automatic request', async () => {
  const p = await probe()
  assert.deepEqual(p.calls, [])
  p.click()
  assert.deepEqual(p.calls, ['native', 'query'])
  assert.equal(p.state().userGesture, true)
  assert.equal(p.state().result, 'PENDING')
  p.click()
  assert.equal(p.calls.filter(x => x === 'native').length, 1)
})

test('a missing native callback is distinguished from denial and a late success is observed without coordinates', async () => {
  const p = await probe()
  p.click(); p.deadline()
  assert.equal(p.state().result, 'NO_RESPONSE')
  p.success({ coords: { latitude: 37.123456, longitude: 127.123456 } })
  assert.equal(p.state().result, 'SUCCESS')
  assert.doesNotMatch(p.node('report').textContent, /latitude|longitude|37\.123456|127\.123456/)
})

test('native rejection reports its error code without attributing it to app or site settings', async () => {
  const p = await probe()
  p.click(); p.error({ code: 1 })
  assert.equal(p.state().result, 'DENIED')
  assert.equal(p.state().nativeErrorCode, 1)
  p.deadline()
  assert.equal(p.state().result, 'DENIED')
  assert.match(p.node('detail').textContent, /구분할 수 없습니다/)
})
