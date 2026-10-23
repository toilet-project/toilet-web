import assert from 'node:assert/strict'
import test from 'node:test'
import { withHomeServerTiming } from '../home-server-timing.mjs'
import { protectNavigationResponse } from '../worker-cache-policy.mjs'

const origin = 'https://preview.geupddong.com'
const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store',
  Vary: 'RSC, Next-Router-State-Tree', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' }
const request = (path = '/?map-server-timing=1&map-timing=1', options) => new Request(origin + path, options)
const html = () => new Response('unchanged document', { headers })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const timing = response => new Map((response.headers.get('Server-Timing') ?? '').split(',').map(part => {
  const name = part.trim().split(';')[0]
  const duration = part.match(/;dur=([\d.]+)/)?.[1]
  const count = part.match(/;desc="(\d+)"/)?.[1]
  return [name, { duration: duration === undefined ? undefined : Number(duration), count: count === undefined ? undefined : Number(count) }]
}))

// Private fields enforce native-style receiver checks: a transparent-looking
// Proxy still fails if it forwards a method/getter with the wrong receiver.
class NativeBody {
  #value
  constructor(value) { this.#value = value }
  get uploaded() { return new Date(1234 + this.#value) }
  get etag() { return `etag-${this.#value}` }
  async json() { return { value: this.#value } }
  async text() { return String(this.#value) }
}
class NativeBucket {
  #reads = 0
  next = null
  async get() { this.#reads++; return this.next ? this.next : new NativeBody(this.#reads) }
  get reads() { return this.#reads }
  async head() { return { reads: this.#reads } }
}
class NativeStatement {
  #arguments
  constructor(values = []) { this.#arguments = values }
  bind(...values) { return new NativeStatement(values) }
  nativeValues() { return this.#arguments }
  async raw() { return [this.#arguments] }
  async all() { return { results: this.#arguments } }
  async first() { return this.#arguments[0] }
  async run() { return { success: true, values: this.#arguments } }
}
class NativeDatabase {
  #prepared = 0
  prepare() { this.#prepared++; return new NativeStatement() }
  async batch(statements) { return statements.map(statement => statement.nativeValues()) }
  get prepared() { return this.#prepared }
}
class NativeContext {
  #operations = []
  waitUntil(operation) {
    this.#operations.push(operation)
    // Simulate the runtime retaining and observing the original promise.
    void Promise.resolve(operation).catch(() => {})
  }
  get operations() { return this.#operations }
  passThroughOnException() { return this.#operations.length }
}
const fixture = () => ({ SITE_INDEXABLE: 'false', SOME_OTHER_BINDING: { untouched: true },
  NEXT_INC_CACHE_R2_BUCKET: new NativeBucket(), NEXT_TAG_CACHE_D1: new NativeDatabase() })

test('production, ordinary preview, non-home and navigation-protocol requests retain original env/context/response', async () => {
  const env = fixture(), ctx = new NativeContext()
  const cases = [[request('/'), env], [request(), { ...env, SITE_INDEXABLE: 'true' }],
    [new Request('https://geupddong.com/?map-server-timing=1'), env],
    [new Request('http://preview.geupddong.com/?map-server-timing=1'), env],
    [request('/api/map-area?map-server-timing=1'), env], [request('/en/?map-server-timing=1'), env],
    [request('/?map-server-timing=0'), env], [request('/?map-server-timing=1&map-server-timing=1'), env],
    [request('/?map-server-timing=1&_rsc=opaque'), env], [request(undefined, { method: 'HEAD' }), env],
    [request(undefined, { method: 'POST' }), env]]
  for (const name of ['RSC', 'Next-Action', 'Next-Router-Prefetch', 'Next-Router-Segment-Prefetch',
    'X-Prerender-Revalidate', 'Authorization', 'Upgrade'])
    cases.push([request(undefined, { headers: { [name]: '1' } }), env])
  for (const name of ['Purpose', 'Sec-Purpose']) cases.push([request(undefined, { headers: { [name]: 'prefetch' } }), env])
  for (const [input, bindings] of cases) {
    const response = html()
    assert.equal(await withHomeServerTiming(input, bindings, ctx, (seen, actualEnv, actualCtx) => {
      assert.equal(seen, input); assert.equal(actualEnv, bindings); assert.equal(actualCtx, ctx)
      return response
    }), response)
    assert.equal(response.headers.has('Server-Timing'), false)
  }
})

test('all six explicit home documents expose only numeric timing while native receivers and D1 batches remain valid', async () => {
  for (const path of ['/', '/en', '/ja', '/zh-cn', '/zh-tw', '/zh-hk']) {
    const env = fixture(), ctx = new NativeContext(), bucket = env.NEXT_INC_CACHE_R2_BUCKET, database = env.NEXT_TAG_CACHE_D1
    const response = await withHomeServerTiming(request(`${path}?map-server-timing=1`), env, ctx, async (_request, bindings, context) => {
      assert.notEqual(bindings, env); assert.notEqual(context, ctx)
      assert.equal(bindings.SOME_OTHER_BINDING, env.SOME_OTHER_BINDING)
      const body = await bindings.NEXT_INC_CACHE_R2_BUCKET.get('PRIVATE-CACHE-KEY')
      assert.equal(body.uploaded.getTime(), 1235)
      assert.equal(body.etag, 'etag-1')
      assert.deepEqual(await body.json(), { value: 1 })
      assert.equal(await body.text(), '1')
      assert.deepEqual(await bindings.NEXT_INC_CACHE_R2_BUCKET.head(), { reads: 1 })
      const statement = bindings.NEXT_TAG_CACHE_D1.prepare('PRIVATE-SQL').bind('PRIVATE-TAG')
      assert.deepEqual(await statement.raw(), [['PRIVATE-TAG']])
      assert.deepEqual(await statement.all(), { results: ['PRIVATE-TAG'] })
      assert.equal(await statement.first(), 'PRIVATE-TAG')
      assert.equal((await statement.run()).success, true)
      assert.deepEqual(await bindings.NEXT_TAG_CACHE_D1.batch([statement]), [['PRIVATE-TAG']])
      assert.equal(context.passThroughOnException(), 0)
      assert.equal(context.operations, ctx.operations)
      return html()
    })
    assert.equal(env.NEXT_INC_CACHE_R2_BUCKET, bucket)
    assert.equal(env.NEXT_TAG_CACHE_D1, database)
    assert.equal(bucket.reads, 1); assert.equal(database.prepared, 1)
    const measured = timing(response)
    assert.equal(measured.get('home-r2-get').count, 1)
    assert.equal(measured.get('home-r2-json').count, 1)
    assert.equal(measured.get('home-d1').count, 5)
    assert.equal(measured.get('home-pending').count, 0)
    for (const metric of ['home-handler', 'home-r2-get', 'home-r2-json', 'home-d1'])
      assert.ok(Number.isFinite(measured.get(metric).duration) && measured.get(metric).duration >= 0)
    assert.doesNotMatch(response.headers.get('Server-Timing'), /PRIVATE|CACHE|SQL|TAG|preview|geupddong/)
  }
})

test('timing counts remain isolated when diagnostic requests run concurrently on the same bindings', async () => {
  const env = fixture(), ctx = new NativeContext(), paused = deferred(), entered = deferred()
  const first = withHomeServerTiming(request(), env, ctx, async (_request, bindings) => {
    await bindings.NEXT_INC_CACHE_R2_BUCKET.get('first')
    entered.resolve()
    await paused.promise
    return html()
  })
  await entered.promise
  const second = await withHomeServerTiming(request(), env, ctx, async (_request, bindings) => {
    await bindings.NEXT_INC_CACHE_R2_BUCKET.get('second')
    await bindings.NEXT_INC_CACHE_R2_BUCKET.get('third')
    await bindings.NEXT_TAG_CACHE_D1.prepare('query').bind('value').raw()
    return html()
  })
  paused.resolve()
  assert.equal(timing(await first).get('home-r2-get').count, 1)
  assert.equal(timing(second).get('home-r2-get').count, 2)
  assert.equal(timing(second).get('home-d1').count, 1)
})

test('frozen own native methods can be measured or forwarded without Proxy invariant failures', async () => {
  const freezeMethods = (object, names) => {
    for (const name of names) Object.defineProperty(object, name, { value: object[name] })
    return Object.freeze(object)
  }
  const frozenStatement = values => {
    const statement = new NativeStatement(values)
    Object.defineProperty(statement, 'bind', { value: function (...args) {
      this.nativeValues()
      return frozenStatement(args)
    } })
    return freezeMethods(statement, ['raw', 'all', 'first', 'run', 'nativeValues'])
  }
  const body = freezeMethods(new NativeBody(9), ['json', 'text'])
  const bucket = new NativeBucket()
  bucket.next = body
  freezeMethods(bucket, ['get', 'head'])
  const database = new NativeDatabase()
  Object.defineProperty(database, 'prepare', { value: function (...args) {
    NativeDatabase.prototype.prepare.apply(this, args)
    return frozenStatement([])
  } })
  freezeMethods(database, ['batch'])
  const ctx = freezeMethods(new NativeContext(), ['waitUntil', 'passThroughOnException'])
  const env = Object.freeze({ ...fixture(), NEXT_INC_CACHE_R2_BUCKET: bucket, NEXT_TAG_CACHE_D1: database })
  const response = await withHomeServerTiming(request(), env, ctx, async (_request, bindings, context) => {
    const measuredBody = await bindings.NEXT_INC_CACHE_R2_BUCKET.get('ignored')
    assert.ok(measuredBody instanceof NativeBody)
    assert.deepEqual(await measuredBody.json(), { value: 9 })
    assert.equal(await measuredBody.text(), '9')
    assert.equal(measuredBody.etag, 'etag-9')
    assert.deepEqual(await bindings.NEXT_INC_CACHE_R2_BUCKET.head(), { reads: 1 })
    const statement = bindings.NEXT_TAG_CACHE_D1.prepare('ignored').bind('ignored')
    assert.ok(statement instanceof NativeStatement)
    assert.deepEqual(await statement.raw(), [['ignored']])
    assert.deepEqual(await statement.all(), { results: ['ignored'] })
    assert.equal(await statement.first(), 'ignored')
    assert.equal((await statement.run()).success, true)
    assert.deepEqual(await bindings.NEXT_TAG_CACHE_D1.batch([statement]), [['ignored']])
    const operation = Promise.resolve()
    context.waitUntil(operation)
    assert.equal(ctx.operations[0], operation)
    assert.equal(context.passThroughOnException(), 1)
    return html()
  })
  assert.equal(timing(response).get('home-r2-get').count, 1)
  assert.equal(timing(response).get('home-r2-json').count, 1)
  assert.equal(timing(response).get('home-d1').count, 5)
  assert.equal(bucket.reads, 1)
  assert.equal(database.prepared, 1)
})

test('IO, handler and execution-context errors propagate unchanged', async () => {
  const failure = new Error('fixture failure')
  for (const target of ['r2', 'd1', 'handler', 'context']) {
    const env = fixture(), ctx = new NativeContext()
    if (target === 'r2') env.NEXT_INC_CACHE_R2_BUCKET.get = () => { throw failure }
    if (target === 'd1') env.NEXT_TAG_CACHE_D1.prepare = () => ({ bind() { return this }, raw() { throw failure } })
    if (target === 'context') ctx.waitUntil = () => { throw failure }
    await assert.rejects(withHomeServerTiming(request(), env, ctx, async (_request, bindings, context) => {
      if (target === 'r2') await bindings.NEXT_INC_CACHE_R2_BUCKET.get('ignored')
      if (target === 'd1') await bindings.NEXT_TAG_CACHE_D1.prepare('ignored').bind('ignored').raw()
      if (target === 'context') context.waitUntil(Promise.resolve())
      throw failure
    }), error => error === failure)
  }
})

test('headers freeze before unfinished IO, waitUntil and stream completion without adding background rejection', { timeout: 1_000 }, async () => {
  const env = fixture(), ctx = new NativeContext(), get = deferred(), rejected = deferred()
  env.NEXT_INC_CACHE_R2_BUCKET.next = get.promise
  let stream, lateBody
  const response = await withHomeServerTiming(request(), env, ctx, async (_request, bindings, context) => {
    const unfinished = bindings.NEXT_INC_CACHE_R2_BUCKET.get('ignored').then(body => { lateBody = body })
    context.waitUntil(unfinished)
    context.waitUntil(rejected.promise)
    assert.equal(ctx.operations[1], rejected.promise, 'native context receives the exact original promise')
    return new Response(new ReadableStream({ start(controller) { stream = controller } }), { headers })
  })
  const snapshot = response.headers.get('Server-Timing')
  assert.equal(timing(response).get('home-pending').count, 1)
  assert.equal(timing(response).get('home-background').count, 2)
  get.resolve(new NativeBody(7))
  rejected.reject(new Error('background fixture rejection'))
  const results = await Promise.allSettled(ctx.operations)
  assert.deepEqual(results.map(result => result.status), ['fulfilled', 'rejected'])
  assert.deepEqual(await lateBody.json(), { value: 7 })
  stream.enqueue(new TextEncoder().encode('late document'))
  stream.close()
  assert.equal(await response.text(), 'late document')
  assert.equal(response.headers.get('Server-Timing'), snapshot)
  assert.equal(timing(response).get('home-r2-json').count, 0, 'post-header work is not misreported as pre-header IO')
  await new Promise(resolve => setImmediate(resolve))
})

test('timing headers preserve existing response data, metadata and the navigation no-store guard', async () => {
  const input = request()
  const response = await withHomeServerTiming(input, fixture(), new NativeContext(), () => new Response('unchanged document', {
    status: 503, statusText: 'Temporarily unavailable', headers: { ...headers, 'Server-Timing': 'existing;dur=1' },
  }))
  const guarded = protectNavigationResponse(input, response, 'compiled-version')
  assert.equal(guarded.status, 503); assert.equal(guarded.statusText, 'Temporarily unavailable')
  for (const name of ['Vary', 'X-Robots-Tag', 'X-Content-Type-Options']) assert.equal(guarded.headers.get(name), headers[name])
  for (const name of ['Cache-Control', 'CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control'])
    assert.match(guarded.headers.get(name), /private, no-store/)
  assert.match(guarded.headers.get('Server-Timing'), /^existing;dur=1, home-handler;/)
  assert.equal(await guarded.text(), 'unchanged document')
  const json = Response.json({ untouched: true })
  assert.equal(await withHomeServerTiming(input, fixture(), new NativeContext(), () => json), json)
})
