import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createNavigationFetch, mapNavigationPath } from '../src/lib/navigationCache.ts'
import { protectNavigationResponse } from '../worker-cache-policy.mjs'

const origin = 'https://preview.geupddong.com'
test('previously cached RSC is bypassed, without changing Next cache-key or routing headers', async () => {
  const controller = new AbortController()
  const headers = { RSC: '1', 'Next-Router-State-Tree': 'tree', 'x-deployment-id': 'new' }
  const stale = new Response('old', { headers: { 'content-type': 'text/x-component' } })
  const request = async (url, options) => {
    if (options.cache !== 'no-store') return stale
    assert.equal(url, origin + '/toilet/13531?_rsc=original')
    assert.equal(options.headers, headers)
    assert.equal(options.signal, controller.signal)
    assert.equal(options.credentials, 'same-origin')
    assert.equal(options.priority, 'auto')
    return new Response('new', { headers: { 'content-type': 'text/x-component', 'x-nextjs-deployment-id': 'new' } })
  }
  const fetch = createNavigationFetch(request, origin, 'new', () => assert.fail())
  for (let i = 0; i < 3; i++) {
    assert.equal(await (await fetch(origin + '/toilet/13531?_rsc=original', {
      headers, signal: controller.signal, credentials: 'same-origin', priority: 'auto', cache: 'force-cache',
    })).text(), 'new')
  }
})

test('Request input and init header overrides follow native fetch semantics', async () => {
  const calls = []
  const fetch = createNavigationFetch(async (input, init) => {
    calls.push({ input, init }); return new Response('', { headers: { 'content-type': 'text/x-component' } })
  }, origin, 'new')
  const input = new Request(origin + '/toilet/13531?_rsc=key', { headers: { RSC: '1' } })
  await fetch(input)
  assert.equal(calls[0].input, input)
  assert.equal(calls[0].init.cache, 'no-store')
  const override = { headers: {}, cache: 'force-cache' }
  await fetch(input, override)
  assert.equal(calls[1].init, override)
})

test('API, assets, OAuth, cross-origin requests and POST are untouched', async () => {
  let count = 0
  const init = { cache: 'force-cache' }
  const fetch = createNavigationFetch(async (_, options) => {
    count++; assert.equal(options.cache, 'force-cache'); return new Response('ok')
  }, origin, 'new', () => assert.fail())
  for (const url of ['/api/toilets/1', '/_next/static/hash.css', '/login/oauth2/code/google', '/']) await fetch(url, init)
  await fetch('https://api.geupddong.com/api/test', { ...init, headers: { RSC: '1' } })
  await fetch('/action', { ...init, method: 'POST', headers: { RSC: '1' }, body: 'unchanged' })
  assert.equal(count, 6)
})

test('invalid response, deployment change and network failure are observable; no automatic retry/reload', async () => {
  const events = []
  for (const response of [new Response('html'), new Response('error', { status: 503 }),
    new Response('rsc', { headers: { 'content-type': 'text/x-component', 'x-nextjs-deployment-id': 'old' } })]) {
    let count = 0
    const fetch = createNavigationFetch(async () => { count++; return response }, origin, 'new', e => events.push(e))
    assert.equal(await fetch('/toilet/13531?private=do-not-record', { headers: { RSC: '1' } }), response)
    assert.equal(count, 1)
  }
  const offline = new Error('offline')
  const fetch = createNavigationFetch(async () => { throw offline }, origin, 'new', e => events.push(e))
  await assert.rejects(fetch('/toilet/13531', { headers: { RSC: '1' } }), offline)
  assert.deepEqual(events.map(e => e.kind), ['rsc-invalid', 'rsc-invalid', 'rsc-deployment-change', 'rsc-network-error'])
  assert.doesNotMatch(JSON.stringify(events), /private|do-not-record/)
})

test('outer response cache disabled for HTML/RSC including errors, streams and metadata preserved', async () => {
  for (const type of ['text/html; charset=utf-8', 'text/x-component']) {
    const input = new Response('stream-body', { headers: { 'content-type': type, 'Cache-Control': 's-maxage=3600',
      Vary: 'RSC, Next-Router-State-Tree', 'x-nextjs-deployment-id': 'new', 'x-nextjs-cache': 'HIT' } })
    const response = protectNavigationResponse(new Request(origin), input)
    for (const name of ['cache-control', 'cdn-cache-control', 'cloudflare-cdn-cache-control']) assert.match(response.headers.get(name), /no-store/)
    assert.equal(response.headers.get('vary'), 'RSC, Next-Router-State-Tree')
    assert.equal(response.headers.get('x-nextjs-deployment-id'), 'new')
    assert.equal(response.headers.get('x-nextjs-cache'), 'HIT')
    assert.equal(await response.text(), 'stream-body')
  }
  const error = protectNavigationResponse(new Request(origin, { headers: { RSC: '1' } }), new Response('oops', { status: 500 }))
  assert.equal(error.status, 500)
  assert.match(error.headers.get('cache-control'), /no-store/)
})

test('immutable CSS/JS and ordinary API responses retain their cache policy', () => {
  for (const type of ['text/css', 'text/javascript', 'application/json', 'image/png']) {
    const response = new Response('body', { headers: { 'content-type': type, 'cache-control': 'public,max-age=31536000,immutable' } })
    assert.equal(protectNavigationResponse(new Request(origin), response), response)
  }
})

test('navigation snapshot targets only internal map routes, never auth or external URLs', () => {
  assert.equal(mapNavigationPath('/toilet/13531?_rsc=key', origin), '/toilet/13531')
  assert.equal(mapNavigationPath('/', origin), '/')
  for (const path of ['//evil.test/toilet/13531', '/api/auth/me', '/toilet/0', '/privacy', '/toilet/1/other']) {
    assert.equal(mapNavigationPath(path, origin), null)
  }
})

test('guard installs before hydration, snapshot runs before navigation and pagehide', async () => {
  const source = async path => readFile(new URL(path, import.meta.url), 'utf8')
  assert.match(await source('../src/instrumentation-client.ts'), /window.fetch = createNavigationFetch/)
  assert.match(await source('../src/instrumentation-client.ts'), /export function onRouterTransitionStart/)
  const app = await source('../src/App.tsx')
  assert.match(app, /window.addEventListener\(MAP_NAVIGATION_EVENT, beforeNavigation\)/)
  assert.match(app, /window.addEventListener\('pagehide', beforePageHide\)/)
  assert.match(app, /reference: mapCenter, source: distanceSource/)
  const workflow = await source('../.github/workflows/workers-validation.yml')
  assert.match(workflow, /tar .*custom-worker.mjs worker-cache-policy.mjs/)
})
