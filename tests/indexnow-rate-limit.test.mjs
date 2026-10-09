import assert from 'node:assert/strict'
import test from 'node:test'
import { indexNowFailureInfo, notifyIndexNowForEvents, submitIndexNow } from '../src/server/indexNow.ts'
import { notifyIndexNowForRegionChanges } from '../src/server/indexNowRegion.ts'
import { createIndexNowRateLimit, indexNowRetryAt } from '../src/server/indexNowRateLimit.ts'

const path = '/en/regions/seoul-11/jongno-gu-11110'
function memoryBucket() {
  const objects = new Map()
  let sequence = 0
  return {
    objects,
    async get(key) {
      const value = objects.get(key)
      return value ? { etag: value.etag, json: async () => JSON.parse(value.body) } : null
    },
    async put(key, body, options) {
      const existing = objects.get(key)
      if (options?.onlyIf?.etagDoesNotMatch === '*' && existing
        || options?.onlyIf?.etagMatches && existing?.etag !== options.onlyIf.etagMatches) return null
      const saved = { etag: String(++sequence), body }
      objects.set(key, saved)
      return saved
    },
  }
}

test('Retry-After supports seconds and dates with a minimum ten-minute pause', () => {
  const now = Date.parse('2026-10-09T00:00:00Z')
  for (const header of [null, '', 'invalid', '-1', '30', '9999999999999999999999999'])
    assert.equal(indexNowRetryAt(header, now), now + 600_000)
  assert.equal(indexNowRetryAt('1200', now), now + 1_200_000)
  assert.equal(indexNowRetryAt('Fri, 09 Oct 2026 00:30:00 GMT', now), now + 1_800_000)
})

test('429 makes one request, persists the pause, and blocks detail and district reads across instances', async () => {
  const bucket = memoryBucket()
  let requests = 0
  let waits = 0
  let retryAt
  await assert.rejects(submitIndexNow([path], async () => {
    requests++
    return new Response('', { status: 429, headers: { 'Retry-After': '1200' } })
  }, async () => { waits++ }, createIndexNowRateLimit(bucket)), error => {
    const info = indexNowFailureInfo(error)
    assert.equal(info.reason, 'http')
    assert.equal(info.status, 429)
    assert.ok(info.retryAt >= Date.now() + 1_199_000)
    retryAt = info.retryAt
    return true
  })
  assert.equal(requests, 1)
  assert.equal(waits, 0)
  const unexpected = async () => { throw new Error('must not read origin or submit while paused') }
  for (const task of [
    () => submitIndexNow([path], unexpected, unexpected, createIndexNowRateLimit(bucket)),
    () => notifyIndexNowForEvents([{ toiletId: 177, revision: 2, action: 'UPSERT', catalogChanged: true }],
      unexpected, new Map(), createIndexNowRateLimit(bucket)),
    () => notifyIndexNowForRegionChanges(new Map([['11110', []]]), unexpected, unexpected,
      createIndexNowRateLimit(bucket)),
  ]) await assert.rejects(task(), error => {
    assert.deepEqual(indexNowFailureInfo(error), { reason: 'rate_limit', status: 429, retryAt })
    return true
  })
  assert.equal(bucket.objects.size, 1)
  assert.deepEqual(Object.keys(JSON.parse([...bucket.objects.values()][0].body)).sort(), ['retryAt', 'schema'])
})

test('a concurrent shorter Retry-After cannot overwrite a longer shared pause', async () => {
  const bucket = memoryBucket()
  const first = createIndexNowRateLimit(bucket, () => 0)
  const second = createIndexNowRateLimit(bucket, () => 0)
  await Promise.all([first.defer(900_000), second.defer(600_000)])
  await assert.rejects(createIndexNowRateLimit(bucket, () => 800_000).check(), error => error.retryAt === 900_000)
  await first.defer(1_200_000)
  await assert.rejects(second.check(), error => error.retryAt === 1_200_000)
})

test('an expired pause permits new work without promising to replay earlier URLs', async () => {
  const bucket = memoryBucket()
  await createIndexNowRateLimit(bucket, () => 0).defer(600_000)
  const result = await submitIndexNow([path], async () => new Response('', { status: 200 }),
    async () => {}, createIndexNowRateLimit(bucket, () => 600_000))
  assert.deepEqual(result, { submitted: 1, status: 200 })
})

test('unreadable shared state prevents an outbound request and sanitized errors hide storage messages', async () => {
  const limiter = createIndexNowRateLimit({ get: async () => { throw new Error('private storage diagnostic') } })
  await assert.rejects(submitIndexNow([path], async () => { throw new Error('must not submit') },
    async () => {}, limiter), error => {
    assert.deepEqual(indexNowFailureInfo(error), { reason: 'unexpected', status: null, errorName: 'Error' })
    return true
  })
})

test('failure to persist a pause still never retries the rejected HTTP request', async () => {
  let requests = 0
  const original = console.error
  console.error = () => {}
  try {
    await assert.rejects(submitIndexNow([path], async () => {
      requests++
      return new Response('', { status: 429 })
    }, async () => { throw new Error('must not retry') }, {
      check: async () => {}, defer: async () => { throw new Error('storage unavailable') },
    }), error => indexNowFailureInfo(error).status === 429)
    assert.equal(requests, 1)
  } finally { console.error = original }
})
