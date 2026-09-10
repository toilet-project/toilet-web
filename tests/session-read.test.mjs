import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createSessionReader } from '../src/lib/sessionRead.ts'

const response = (status) => new Response(null, { status })
const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
const fixture = (statuses) => {
  const calls = []
  const read = createSessionReader('/refresh', async (url, options) => {
    calls.push({ url, ...options })
    assert.ok(statuses.length, 'no unexpected retry')
    return response(statuses.shift())
  })
  return { read, calls }
}

test('successful read sends cookies, bypasses cache, and does not refresh', async () => {
  const { read, calls } = fixture([200])
  assert.equal((await read('/reports')).status, 200)
  assert.deepEqual(calls, [{ url: '/reports', method: 'GET', credentials: 'include', cache: 'no-store' }])
})

test('expired access refreshes once and retries the original GET once', async () => {
  const { read, calls } = fixture([401, 204, 200])
  assert.equal((await read('/reports')).status, 200)
  assert.deepEqual(calls.map(({ url, method }) => [url, method]), [
    ['/reports', 'GET'], ['/refresh', 'POST'], ['/reports', 'GET'],
  ])
  assert.ok(calls.every((call) => call.credentials === 'include' && call.cache === 'no-store'))
})

test('repeated 401 stops after one replay', async () => {
  const { read, calls } = fixture([401, 204, 401])
  assert.equal((await read('/reports')).status, 401)
  assert.equal(calls.length, 3)
})

test('failed refresh does not replay or hide the unauthorized response', async () => {
  for (const status of [401, 403, 429, 500, 503]) {
    const { read, calls } = fixture([401, status])
    assert.equal((await read('/reports')).status, 401)
    assert.equal(calls.length, 2)
  }
})

test('non-auth failures are not refreshed or retried', async () => {
  for (const status of [400, 403, 404, 429, 500, 503]) {
    const { read, calls } = fixture([status])
    assert.equal((await read('/reports')).status, status)
    assert.equal(calls.length, 1)
  }
})

test('parallel account and report reads share one refresh', async () => {
  const gate = deferred()
  let refreshCalls = 0
  const reads = new Map()
  const read = createSessionReader('/refresh', async (url) => {
    if (url === '/refresh') { refreshCalls++; await gate.promise; return response(204) }
    const count = (reads.get(url) ?? 0) + 1
    reads.set(url, count)
    return response(count === 1 ? 401 : 200)
  })
  const results = [read('/me'), read('/reports')]
  await new Promise(setImmediate)
  assert.equal(refreshCalls, 1)
  gate.resolve()
  assert.deepEqual((await Promise.all(results)).map((result) => result.status), [200, 200])
  assert.equal(refreshCalls, 1)
})

test('late 401 from before successful refresh does not rotate again', async () => {
  const gate = deferred()
  let refreshCalls = 0
  const reads = new Map()
  const read = createSessionReader('/refresh', async (url) => {
    if (url === '/refresh') { refreshCalls++; return response(204) }
    const count = (reads.get(url) ?? 0) + 1
    reads.set(url, count)
    if (url === '/reports' && count === 1) { await gate.promise; return response(401) }
    return response(count === 1 ? 401 : 200)
  })
  const slow = read('/reports')
  assert.equal((await read('/me')).status, 200)
  gate.resolve()
  assert.equal((await slow).status, 200)
  assert.equal(refreshCalls, 1)
})

test('refresh network failure is propagated and releases the shared promise', async () => {
  let refreshCalls = 0
  const read = createSessionReader('/refresh', async (url) => {
    if (url !== '/refresh') return response(401)
    refreshCalls++
    if (refreshCalls === 1) throw new Error('offline')
    return response(401)
  })
  await assert.rejects(read('/reports'), /offline/)
  assert.equal((await read('/reports')).status, 401)
  assert.equal(refreshCalls, 2)
})

test('initial network failure does not trigger refresh', async () => {
  let calls = 0
  const read = createSessionReader('/refresh', async () => { calls++; throw new Error('offline') })
  await assert.rejects(read('/reports'), /offline/)
  assert.equal(calls, 1)
})

test('only current-user and my-report reads opt into replay', () => {
  const source = (file) => readFileSync(new URL(`../src/api/${file}.ts`, import.meta.url), 'utf8')
  assert.match(source('reports'), /fetchSessionRead\(createApiUrl\('\/api\/v1\/reports\/me'\)\)/)
  assert.match(source('reports'), /fetch\(createApiUrl\('\/api\/v1\/reports'\)/)
  assert.equal((source('auth').match(/await fetchSessionRead\(/g) ?? []).length, 1)
  assert.match(source('auth'), /fetchSessionRead\(createApiUrl\('\/api\/v1\/auth\/me'\)\)/)
  assert.match(source('auth'), /method: 'DELETE'/)
})
