import assert from 'node:assert/strict'
import test from 'node:test'
import { createIndexNowOutbox } from '../src/server/indexNowOutbox.ts'
import { IndexNowSubmissionError } from '../src/server/indexNow.ts'
import { IndexNowRateLimitError } from '../src/server/indexNowRateLimit.ts'

const path = '/en/regions/seoul-11/jongno-gu-11110'
function fixture() {
  const objects = new Map()
  let sequence = 0
  let time = 1_000_000
  const bucket = {
    async get(key) {
      const value = objects.get(key)
      return value ? { etag: value.etag, json: async () => JSON.parse(value.body) } : null
    },
    async put(key, body, { onlyIf } = {}) {
      const current = objects.get(key)
      if (onlyIf?.etagDoesNotMatch === '*' && current || onlyIf?.etagMatches && current?.etag !== onlyIf.etagMatches)
        return null
      const value = { etag: String(++sequence), body }; objects.set(key, value); return value
    },
    async list({ prefix, limit, cursor }) {
      const keys = [...objects.keys()].filter(key => key.startsWith(prefix)).sort()
      const start = cursor ? Number(cursor) : 0
      return { objects: keys.slice(start, start + limit).map(key => ({ key })),
        truncated: start + limit < keys.length, cursor: String(start + limit) }
    },
  }
  return { bucket, objects, now: () => time, advance: ms => { time += ms },
    records: () => [...objects.values()].map(value => JSON.parse(value.body)) }
}
const options = { enabled: true, check: async () => {} }
const accepted = async paths => ({ submitted: paths.length, status: 200 })

test('enqueue filters private and numeric paths, deduplicates and never touches visitor cache keys', async () => {
  const f = fixture(), queue = createIndexNowOutbox(f.bucket, f.now)
  assert.deepEqual(await queue.enqueue('one', ['/admin', '/toilet/177']), { queued: false })
  await queue.enqueue('one', [path, path, '/api/private'])
  assert.deepEqual(await queue.enqueue('one', [path]), { queued: false })
  assert.ok([...f.objects.keys()].every(key => key.startsWith('indexnow/outbox/v1/')))
  assert.deepEqual(f.records()[0].paths, [path])
  await assert.rejects(queue.enqueue('one', ['/en/regions/seoul-11/jung-gu-11140']), /identity reused/)
})

test('received jobs survive restarts and duplicate event deliveries do not resubmit; new revisions remain separate', async () => {
  const f = fixture(), queue = createIndexNowOutbox(f.bucket, f.now)
  await queue.enqueue('event:1', [path])
  assert.equal((await queue.drain(accepted, options)).received, 1)
  const restarted = createIndexNowOutbox(f.bucket, f.now)
  await restarted.enqueue('event:1', [path])
  assert.equal((await restarted.drain(() => { throw new Error('duplicate') }, options)).received, 0)
  await restarted.enqueue('event:2', [path])
  assert.equal((await restarted.drain(accepted, options)).received, 1)
})

test('429 persists Retry-After, survives restart and sends only after the due time', async () => {
  const f = fixture(), queue = createIndexNowOutbox(f.bucket, f.now)
  await queue.enqueue('one', [path])
  const due = f.now() + 1_200_000
  assert.equal((await queue.drain(async () => { throw new IndexNowSubmissionError('http', 429, due) }, options)).deferred, 1)
  const restarted = createIndexNowOutbox(f.bucket, f.now)
  assert.equal((await restarted.drain(() => { throw new Error('too soon') }, options)).received, 0)
  f.advance(1_200_000)
  assert.equal((await restarted.drain(accepted, options)).received, 1)
})

test('preview disabled and common cooldown prevent scanning and outbound requests', async () => {
  const unexpected = async () => { throw new Error('unexpected access') }
  const queue = createIndexNowOutbox({ list: unexpected, get: unexpected, put: unexpected })
  assert.equal((await queue.drain(unexpected, { enabled: false, check: unexpected })).received, 0)
  await assert.rejects(queue.drain(unexpected, { enabled: true,
    check: async () => { throw new IndexNowRateLimitError(Date.now() + 600_000) } }), IndexNowRateLimitError)
})

test('concurrent consumers claim once and deduplicate URLs across distinct events', async () => {
  const f = fixture(), queue = createIndexNowOutbox(f.bucket, f.now)
  await queue.enqueue('one', [path]); await queue.enqueue('two', [path])
  const sent = []
  const send = async paths => { sent.push(paths); return accepted(paths) }
  await Promise.all([queue.drain(send, options), createIndexNowOutbox(f.bucket, f.now).drain(send, options)])
  assert.deepEqual(sent, [[path]])
  assert.ok(f.records().every(job => job.state === 'received'))
})

test('crash after remote receipt leaves a recoverable lease, not an erased job', async () => {
  const f = fixture(), queue = createIndexNowOutbox(f.bucket, f.now)
  await queue.enqueue('one', [path])
  const put = f.bucket.put
  f.bucket.put = async (key, body, options) => {
    if (JSON.parse(body).state === 'received') throw new Error('storage unavailable')
    return put(key, body, options)
  }
  await assert.rejects(queue.drain(accepted, options), /storage unavailable/)
  f.bucket.put = put
  assert.equal(f.records()[0].state, 'leased')
  assert.equal((await queue.drain(accepted, options)).received, 0)
  f.advance(120_000)
  assert.equal((await queue.drain(accepted, options)).received, 1)
})

test('permanent rejection is retained for inspection; 202 records receipt, not indexation', async () => {
  const f = fixture(), queue = createIndexNowOutbox(f.bucket, f.now)
  await queue.enqueue('one', [path])
  assert.equal((await queue.drain(async () => { throw new IndexNowSubmissionError('http', 422) }, options)).blocked, 1)
  assert.equal(f.records()[0].state, 'blocked')
  await queue.enqueue('two', [path])
  assert.equal((await queue.drain(async paths => ({ submitted: paths.length, status: 202 }), options)).received, 1)
  assert.equal(f.records().find(job => job.state === 'received').status, 202)
})

test('cursor reaches later jobs without repeatedly scanning the first page', async () => {
  const f = fixture(), queue = createIndexNowOutbox(f.bucket, f.now)
  await queue.enqueue('one', [path]); await queue.enqueue('two', [path]); await queue.enqueue('three', [path])
  let cursor, total = 0
  do {
    const result = await queue.drain(accepted, { ...options, limit: 1, cursor })
    cursor = result.cursor; total += result.received
  } while (cursor)
  assert.equal(total, 3)
})

test('transient failures back off and exhausted work remains blocked rather than deleted', async () => {
  const f = fixture(), queue = createIndexNowOutbox(f.bucket, f.now)
  await queue.enqueue('one', [path])
  for (let attempt = 1; attempt <= 8; attempt++) {
    const result = await queue.drain(async () => { throw new IndexNowSubmissionError('timeout') }, options)
    const job = f.records()[0]
    assert.equal(job.attempts, attempt)
    assert.equal(attempt === 8 ? result.blocked : result.deferred, 1)
    f.advance(job.dueAt - f.now())
  }
  assert.equal(f.records()[0].state, 'blocked')
  assert.equal((await queue.drain(() => { throw new Error('exhausted') }, options)).received, 0)
})

test('lease ownership changes cannot be overwritten by an older consumer receipt', async () => {
  const f = fixture(), queue = createIndexNowOutbox(f.bucket, f.now)
  await queue.enqueue('one', [path])
  const result = await queue.drain(async paths => {
    const [key, value] = [...f.objects][0]
    f.objects.set(key, { ...value, etag: 'new-owner' })
    return accepted(paths)
  }, options)
  assert.equal(result.received, 0)
  assert.equal(f.records()[0].state, 'leased')
})

test('a cooldown starting after claims defers the jobs without an outbound request', async () => {
  const f = fixture(), queue = createIndexNowOutbox(f.bucket, f.now)
  await queue.enqueue('one', [path])
  let checks = 0
  const result = await queue.drain(() => { throw new Error('must not send') }, {
    enabled: true, check: async () => {
      if (++checks === 2) throw new IndexNowRateLimitError(f.now() + 1_800_000)
    },
  })
  assert.equal(result.deferred, 1)
  assert.equal(f.records()[0].dueAt, f.now() + 1_800_000)
  assert.equal(f.records()[0].attempts, 0)
})

test('corrupted records and enqueue storage failures are surfaced, never acknowledged as saved', async () => {
  const f = fixture(), queue = createIndexNowOutbox(f.bucket, f.now)
  await queue.enqueue('one', [path])
  const [key, value] = [...f.objects][0]
  f.objects.set(key, { ...value, body: JSON.stringify({ ...JSON.parse(value.body), paths: ['/admin'] }) })
  await assert.rejects(queue.drain(() => { throw new Error('must not send') }, options), /Invalid IndexNow outbox/)
  f.bucket.put = async () => { throw new Error('storage unavailable') }
  await assert.rejects(queue.enqueue('two', [path]), /storage unavailable/)
})
