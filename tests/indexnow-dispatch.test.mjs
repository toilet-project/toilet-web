import assert from 'node:assert/strict'
import test from 'node:test'
import { dispatchIndexNow } from '../src/server/indexNowDispatcher.ts'
import { createIndexNowDelivery } from '../src/server/indexNowDelivery.ts'
import { IndexNowSubmissionError, submitIndexNow } from '../src/server/indexNow.ts'
import { IndexNowRateLimitError } from '../src/server/indexNowRateLimit.ts'
import { createIndexNowDispatchRequest, verifyIndexNowDispatchRequest, runScheduledIndexNow } from '../indexnow-dispatch.mjs'
import { indexNowMemory } from './fixtures/indexnow-memory.mjs'

const path = '/en/regions/seoul-11/jongno-gu-11110'
const secret = 'test-only-indexnow-signing-key-32-bytes-long'
const never = async () => { throw new Error('unexpected access') }
const check = async () => {}
const accepted = async paths => ({ submitted: paths.length, status: 200 })
const event = { toiletId: 177, revision: 2, action: 'UPSERT', catalogChanged: true }
const before = { detail: async () => null, district: async () => null }
async function ready(f) {
  const delivery = createIndexNowDelivery(f.bucket, f.now)
  await delivery.release(await delivery.prepare([event], [], before))
}

test('scheduled/authenticated dispatch resolves a saved intent and records remote receipt without cache key writes', async () => {
  const f = indexNowMemory(); await ready(f)
  const result = await dispatchIndexNow({ enabled: true, bucket: f.bucket, now: f.now, check,
    resolve: async () => [path], send: accepted })
  assert.equal(result.completed, 1); assert.equal(result.received, 1)
  assert.ok([...f.objects.keys()].every(key => key.startsWith('indexnow/')))
})

test('global CAS lease and ten-minute minimum prevent simultaneous or repeated drain requests', async () => {
  const f = indexNowMemory(); await ready(f)
  let sent = 0
  const options = { enabled: true, bucket: f.bucket, now: f.now, check,
    resolve: async () => [path], send: async paths => { sent++; return accepted(paths) } }
  const results = await Promise.all([dispatchIndexNow(options), dispatchIndexNow(options)])
  assert.equal(sent, 1)
  assert.ok(results.some(result => ['busy', 'waiting'].includes(result.state)))
  assert.equal((await dispatchIndexNow(options)).state, 'waiting')
})

test('global cursors survive new instances and eventually reach later pages of intents', async () => {
  const f = indexNowMemory(), delivery = createIndexNowDelivery(f.bucket, f.now)
  const events = Array.from({ length: 5 }, (_, i) => ({ ...event, toiletId: 177 + i }))
  await delivery.release(await delivery.prepare(events, [], before))
  let completed = 0
  for (let i = 0; i < 3; i++) {
    const result = await dispatchIndexNow({ enabled: true, bucket: f.bucket, now: f.now, check,
      resolve: async () => [path], send: accepted })
    completed += result.completed; f.advance(600_000)
  }
  assert.equal(completed, 5)
})

test('shared cooldown prevents all origin/submission work and keeps pending jobs intact', async () => {
  const f = indexNowMemory(); await ready(f)
  await assert.rejects(dispatchIndexNow({ enabled: true, bucket: f.bucket, now: f.now,
    check: async () => { throw new IndexNowRateLimitError(f.now() + 1_200_000) },
    resolve: never, send: never }), IndexNowRateLimitError)
  assert.equal(f.records('indexnow/intents/')[0].state, 'pending')
  assert.equal(f.records('indexnow/control/')[0].nextRunAt, f.now() + 1_200_000)
})

test('429 and process restart keep queued URLs available for a later scheduled invocation', async () => {
  const f = indexNowMemory(); await ready(f)
  let calls = 0
  const base = { enabled: true, bucket: f.bucket, now: f.now, check, resolve: async () => [path] }
  const first = await dispatchIndexNow({ ...base, send: async () => {
    calls++; throw new IndexNowSubmissionError('http', 429, f.now() + 1_200_000)
  } })
  assert.equal(first.deferred, 1)
  f.advance(600_000)
  assert.equal((await dispatchIndexNow({ ...base, send: accepted })).received, 0)
  f.advance(600_000)
  assert.equal((await dispatchIndexNow({ ...base, send: accepted })).received, 1)
  assert.equal(calls, 1)
})

test('disabled preview dispatch cannot touch storage or emit requests', async () => {
  assert.equal((await dispatchIndexNow({ enabled: false, bucket: { get: never }, check: never,
    resolve: never, send: never })).state, 'disabled')
  assert.equal((await runScheduledIndexNow({ INDEXNOW_OUTBOX_ENABLED: 'true', SITE_INDEXABLE: 'false' }, never)).state, 'disabled')
})

test('cron signer uses path-bound expiring HMAC; missing, wrong, stale and cache-revalidation signatures are rejected', async () => {
  const now = 1_790_000_000_000
  assert.equal(await verifyIndexNowDispatchRequest(await createIndexNowDispatchRequest(secret, now), secret, now), true)
  assert.equal(await verifyIndexNowDispatchRequest(await createIndexNowDispatchRequest(secret, now), secret, now + 301_000), false)
  assert.equal(await verifyIndexNowDispatchRequest(await createIndexNowDispatchRequest(secret, now), secret + 'wrong', now), false)
  const copied = await createIndexNowDispatchRequest(secret, now)
  assert.equal(await verifyIndexNowDispatchRequest(new Request('https://geupddong.com/_internal/cache/revalidate',
    { method: 'POST', headers: copied.headers, body: '{}' }), secret, now), false)
  const tooLarge = await createIndexNowDispatchRequest(secret, now)
  assert.equal(await verifyIndexNowDispatchRequest(new Request(tooLarge.url,
    { method: 'POST', headers: tooLarge.headers, body: '{"extra":true}' }), secret, now), false)
  assert.equal(await verifyIndexNowDispatchRequest(new Request(copied.url, { method: 'POST', body: '{}' }), secret, now), false)
})

test('scheduled invocation calls the internal handler, not an external IndexNow endpoint', async () => {
  let requests = 0
  const env = { SITE_INDEXABLE: 'true', INDEXNOW_ENABLED: 'true', INDEXNOW_OUTBOX_ENABLED: 'true',
    CACHE_REVALIDATION_SECRET: secret }
  assert.equal((await runScheduledIndexNow(env, async request => {
    requests++
    assert.equal(await verifyIndexNowDispatchRequest(request, secret), true)
    return Response.json({ state: 'processed' })
  })).state, 'dispatched')
  assert.equal(requests, 1)
})

test('durable dispatcher single-attempt mode leaves retry policy to the persisted queue', async () => {
  let attempts = 0
  await assert.rejects(submitIndexNow([path], async () => {
    attempts++; return new Response('', { status: 503 })
  }, never, undefined, 1), error => error.status === 503)
  assert.equal(attempts, 1)
})
