import assert from 'node:assert/strict'
import test from 'node:test'
import { createIndexNowOutbox } from '../src/server/indexNowOutbox.ts'
import { createIndexNowDelivery } from '../src/server/indexNowDelivery.ts'
import { operateIndexNow } from '../src/server/indexNowOperations.ts'
import { dispatchIndexNow } from '../src/server/indexNowDispatcher.ts'
import { INDEXNOW_RETENTION_MS, indexNowDigest } from '../src/server/indexNowLifecycle.ts'
import { IndexNowSubmissionError } from '../src/server/indexNow.ts'
import { IndexNowRateLimitError } from '../src/server/indexNowRateLimit.ts'
import { createIndexNowManageRequest, verifyIndexNowManageRequest, createIndexNowDispatchRequest } from '../indexnow-dispatch.mjs'
import { runIndexNowOperation } from '../scripts/indexnow-operations.mjs'
import { indexNowMemory } from './fixtures/indexnow-memory.mjs'

const path = '/en/regions/seoul-11/jongno-gu-11110'
const check = async () => {}, never = async () => { throw new Error('unexpected access') }
const accepted = async paths => ({ submitted: paths.length, status: 200 })
const event = { toiletId: 177, revision: 2, action: 'UPSERT', catalogChanged: true }
const before = { detail: async () => null, district: async () => null }
const drainOptions = { enabled: true, check }
const secret = 'test-only-operation-signing-secret-32-bytes-long'
const op = (f, request, pause = check) => operateIndexNow(f.bucket, request, { now: f.now, check: pause })
const first = (f, prefix = 'indexnow/outbox/') => [...f.objects].find(([key]) => key.startsWith(prefix))
async function rejected(f) {
  const queue = createIndexNowOutbox(f.bucket, f.now)
  await queue.enqueue('rejected', [path])
  await queue.drain(async () => { throw new IndexNowSubmissionError('http', 422) }, drainOptions)
  const [key, value] = first(f)
  return { key, etag: value.etag }
}

test('30-day receipt compaction keeps duplicate protection without URL payloads or record deletion', async () => {
  const f = indexNowMemory(), queue = createIndexNowOutbox(f.bucket, f.now)
  await queue.enqueue('one', [path]); await queue.drain(accepted, drainOptions)
  let [key, value] = first(f)
  assert.equal((await op(f, { action: 'compact', key, etag: value.etag, confirm: true })).state, 'ineligible')
  f.advance(INDEXNOW_RETENTION_MS)
  assert.equal((await op(f, { action: 'compact', key, etag: value.etag })).state, 'eligible')
  assert.equal(f.objects.get(key).body, value.body)
  assert.equal((await op(f, { action: 'compact', key, etag: value.etag, confirm: true })).state, 'compacted')
  assert.equal(f.objects.size, 1)
  const receipt = f.records('indexnow/outbox/')[0]
  assert.deepEqual(receipt.paths, []); assert.equal(receipt.pathCount, 1)
  assert.equal(receipt.pathsDigest, await indexNowDigest(JSON.stringify([path])))
  assert.ok(!f.objects.get(key).body.includes(path))
  assert.deepEqual(await queue.enqueue('one', [path]), { queued: false })
  await assert.rejects(queue.enqueue('one', ['/en/regions/seoul-11/jung-gu-11140']), /identity reused/)
  assert.equal((await queue.drain(never, drainOptions)).received, 0)
  assert.equal((await op(f, { action: 'compact', key, etag: value.etag, confirm: true })).state, 'conflict')
})

test('compacted completed intent still acknowledges duplicate sender delivery without resolving it again', async () => {
  const f = indexNowMemory(), delivery = createIndexNowDelivery(f.bucket, f.now)
  const keys = await delivery.prepare([event], [], before)
  await delivery.release(keys)
  await delivery.resolvePending(async () => [path], { check })
  f.advance(INDEXNOW_RETENTION_MS)
  const current = await delivery.inspect(keys[0])
  assert.equal((await delivery.compact(keys[0], current.etag, true)).state, 'compacted')
  assert.equal(f.records('indexnow/intents/')[0].intent, undefined)
  assert.equal(f.records('indexnow/intents/')[0].paths, undefined)
  assert.deepEqual(await delivery.prepare([event], [], { detail: never, district: never }), keys)
  await delivery.release(keys)
  assert.equal((await delivery.resolvePending(never, { check })).completed, 0)
})

test('manual recovery defaults to dry run, preserves paths, honors cooldown and rejects a stale ETag', async () => {
  const f = indexNowMemory(), target = await rejected(f), old = f.objects.get(target.key).body
  assert.equal((await op(f, { action: 'recover', ...target })).state, 'eligible')
  assert.equal(f.objects.get(target.key).body, old)
  await assert.rejects(op(f, { action: 'recover', ...target, confirm: true }, async () => {
    throw new IndexNowRateLimitError(f.now() + 1_200_000)
  }), IndexNowRateLimitError)
  assert.equal(f.objects.get(target.key).body, old)
  assert.equal((await op(f, { action: 'recover', ...target, confirm: true })).state, 'recovered')
  const job = f.records('indexnow/outbox/')[0]
  assert.equal(job.state, 'pending'); assert.equal(job.attempts, 0); assert.equal(job.recoveries, 1)
  assert.equal(job.dueAt, f.now() + 600_000); assert.deepEqual(job.paths, [path])
  assert.equal((await op(f, { action: 'recover', ...target, confirm: true })).state, 'conflict')
  assert.equal((await createIndexNowOutbox(f.bucket, f.now).drain(never, drainOptions)).received, 0)
})

test('pending, staged, leased and blocked records are never automatically compacted or removed', async () => {
  const f = indexNowMemory(), target = await rejected(f)
  const delivery = createIndexNowDelivery(f.bucket, f.now)
  const keys = await delivery.prepare([event], [], before)
  f.advance(INDEXNOW_RETENTION_MS * 2)
  assert.equal((await op(f, { action: 'compact', ...target, confirm: true })).state, 'ineligible')
  const staged = await delivery.inspect(keys[0])
  assert.equal((await delivery.compact(keys[0], staged.etag, true)).state, 'ineligible')
  assert.equal((await delivery.recover(keys[0], staged.etag)).state, 'ineligible')
  const report = await op(f, { action: 'inspect', kind: 'intents' })
  assert.equal(report.records[0].needsSenderReplay, true)
  assert.equal(report.records[0].canRecover, false)
  const queue = createIndexNowOutbox(f.bucket, f.now)
  for (const state of ['pending', 'leased']) {
    await queue.enqueue(state, [path])
    const [key, value] = [...f.objects].find(([key, value]) => key.startsWith('indexnow/outbox/')
      && JSON.parse(value.body).state === 'pending')
    const body = JSON.stringify({ ...JSON.parse(value.body), state, settledAt: f.now() - INDEXNOW_RETENTION_MS,
      leaseUntil: state === 'leased' ? f.now() + 120_000 : 0 })
    await f.bucket.put(key, body)
    assert.equal((await op(f, { action: 'compact', key, etag: f.objects.get(key).etag, confirm: true })).state, 'ineligible')
    assert.equal(f.objects.get(key).body, body)
    // Do not select this pending fixture again in the next iteration.
    if (state === 'pending') await f.bucket.put(key, JSON.stringify({ ...JSON.parse(body), state: 'leased', leaseUntil: f.now() + 120_000 }))
  }
  assert.equal(f.objects.size, 4)
})

test('recovery is bounded to three reviewed attempts and storage races cannot overwrite another operator', async () => {
  const f = indexNowMemory(), target = await rejected(f)
  for (let i = 1; i <= 3; i++) {
    const etag = f.objects.get(target.key).etag
    const results = await Promise.all([op(f, { action: 'recover', key: target.key, etag, confirm: true }),
      op(f, { action: 'recover', key: target.key, etag, confirm: true })])
    assert.equal(results.filter(result => result.state === 'recovered').length, 1)
    const job = f.records('indexnow/outbox/')[0]
    assert.equal(job.recoveries, i)
    await f.bucket.put(target.key, JSON.stringify({ ...job, state: 'blocked', settledAt: f.now() }))
  }
  assert.equal((await op(f, { action: 'recover', key: target.key, etag: f.objects.get(target.key).etag, confirm: true })).state, 'ineligible')
})

test('inspection is page-scoped, does not expose URLs, and marks damaged records rather than claiming zero work', async () => {
  const f = indexNowMemory(), queue = createIndexNowOutbox(f.bucket, f.now)
  for (let i = 0; i < 25; i++) await queue.enqueue(String(i), [path])
  const [key, value] = first(f)
  f.objects.set(key, { ...value, body: '{invalid' })
  const report = await op(f, { action: 'inspect', kind: 'outbox' })
  assert.equal(report.scope, 'page'); assert.equal(report.records.length, 20); assert.ok(report.cursor)
  assert.ok(!JSON.stringify(report).includes('/en/regions/'))
  const all = [...report.records, ...(await op(f, { action: 'inspect', kind: 'outbox', cursor: report.cursor })).records]
  assert.equal(all.length, 25); assert.equal(all.filter(item => item.state === 'unreadable').length, 1)
  await assert.rejects(op(f, { action: 'recover', key: 'public-toilets/v1/toilets/177.json', etag: '1', confirm: true }), /Invalid IndexNow/)
  await assert.rejects(op(f, { action: 'inspect', kind: 'outbox', limit: 21 }), /Invalid IndexNow/)
})

test('completed history is skipped using atomic metadata and bounded cursors eventually reach new work', async () => {
  const f = indexNowMemory(), queue = createIndexNowOutbox(f.bucket, f.now)
  for (let i = 0; i < 1000; i++) await f.bucket.put('indexnow/outbox/v1/' + i.toString(16).padStart(64, '0') + '.json',
    JSON.stringify({ schema: 1, paths: [path], state: 'received', attempts: 1, dueAt: f.now(), leaseUntil: 0, status: 200,
      settledAt: f.now(), createdAt: f.now(), updatedAt: f.now() }),
    { customMetadata: { indexnow: '1', state: 'received', settledAt: String(f.now()) } })
  for (let i = 0; i < 25; i++) await queue.enqueue('pending-' + i, [path])
  const get = f.bucket.get; let reads = 0, sent = 0, receipts = 0
  f.bucket.get = async (...args) => { reads++; return get(...args) }
  for (let i = 0; i < 5; i++) {
    const result = await dispatchIndexNow({ enabled: true, bucket: f.bucket, now: f.now, check,
      resolve: never, send: async paths => { sent++; return accepted(paths) } })
    receipts += result.received; assert.ok(result.outboxScanned <= 1000)
    f.advance(600_000)
  }
  assert.equal(receipts, 25); assert.equal(sent, 3)
  assert.ok(reads < 100, 'completed history must not cause a body read for every historical object')
  const status = await op(f, { action: 'status' })
  assert.equal(status.sampled, true); assert.equal(status.lastRun.state, 'processed')
})

test('twenty-second soft budget yields safely without a remote call and keeps unresolved work recoverable', async () => {
  const f = indexNowMemory(), delivery = createIndexNowDelivery(f.bucket, f.now)
  await delivery.release(await delivery.prepare(Array.from({ length: 10 }, (_, i) => ({ ...event, toiletId: 177 + i })), [], before))
  let origins = 0
  const result = await dispatchIndexNow({ enabled: true, bucket: f.bucket, now: f.now, check,
    resolve: async () => { origins++; f.advance(7_000); return [path] }, send: never })
  assert.equal(result.yielded, true); assert.ok(origins <= 4)
  assert.equal(f.records('indexnow/intents/').filter(item => item.state === 'done').length, origins)
  assert.ok(f.records('indexnow/intents/').some(item => item.state === 'pending'))
  f.advance(600_000)
  assert.ok((await dispatchIndexNow({ enabled: true, bucket: f.bucket, now: f.now, check,
    resolve: async () => [path], send: accepted })).received > 0)
})

test('budget expiry before send returns claimed work without consuming an attempt', async () => {
  const f = indexNowMemory(), queue = createIndexNowOutbox(f.bucket, f.now)
  await queue.enqueue('budget', [path])
  let probes = 0
  const result = await queue.drain(never, { ...drainOptions, proceed: () => ++probes === 1 })
  assert.equal(result.deferred, 1)
  assert.equal(f.records('indexnow/outbox/')[0].attempts, 0)
  assert.equal(f.records('indexnow/outbox/')[0].state, 'pending')
})

test('slow control storage is included in the soft budget before new work begins', async () => {
  const f = indexNowMemory(), queue = createIndexNowOutbox(f.bucket, f.now)
  await queue.enqueue('waiting', [path])
  const get = f.bucket.get
  f.bucket.get = async key => {
    if (key === 'indexnow/control/v1/dispatch.json') f.advance(21_000)
    return get(key)
  }
  const result = await dispatchIndexNow({ enabled: true, bucket: f.bucket, now: f.now, check, resolve: never, send: never })
  assert.equal(result.yielded, true); assert.equal(result.outboxScanned, 0)
  assert.equal(f.records('indexnow/outbox/')[0].attempts, 0)
})

test('scheduled compaction is capped and leaves old records without a known completion time intact', async () => {
  const f = indexNowMemory(), queue = createIndexNowOutbox(f.bucket, f.now)
  for (let i = 0; i < 6; i++) await queue.enqueue('receipt-' + i, [path])
  await queue.drain(accepted, drainOptions)
  const [key, value] = first(f), legacy = JSON.parse(value.body)
  delete legacy.settledAt; delete legacy.createdAt; delete legacy.updatedAt
  await f.bucket.put(key, JSON.stringify(legacy))
  f.advance(INDEXNOW_RETENTION_MS)
  const result = await dispatchIndexNow({ enabled: true, bucket: f.bucket, now: f.now, check, resolve: never, send: never })
  assert.equal(result.compacted, 2)
  assert.equal(f.records('indexnow/outbox/').filter(item => item.compactedAt !== undefined).length, 2)
  assert.ok(JSON.parse(f.objects.get(key).body).paths.length > 0)
  assert.equal(f.objects.size, 7) // six receipts plus dispatch control
})

test('management HMAC binds the operation body and cannot reuse dispatch or expired signatures', async () => {
  const request = await createIndexNowManageRequest(secret, { action: 'status' })
  assert.deepEqual(await verifyIndexNowManageRequest(request, secret), { action: 'status' })
  const signed = await createIndexNowManageRequest(secret, { action: 'status' })
  assert.equal(await verifyIndexNowManageRequest(new Request(signed.url, { method: 'POST', headers: signed.headers,
    body: JSON.stringify({ action: 'inspect', kind: 'outbox' }) }), secret), null)
  assert.equal(await verifyIndexNowManageRequest(await createIndexNowDispatchRequest(secret), secret), null)
  assert.equal(await verifyIndexNowManageRequest(await createIndexNowManageRequest(secret, { action: 'status' }, 1_790_000_000_000), secret), null)
})

test('operator CLI requires explicit target and extra confirmation for production writes; default is dry run', async () => {
  const env = { CACHE_REVALIDATION_SECRET: secret }
  await assert.rejects(runIndexNowOperation([], env, never), /Explicit target/)
  await assert.rejects(runIndexNowOperation(['--target', 'production', '--action', 'recover', '--confirm-reviewed'], env, never), /Production mutation/)
  const result = await runIndexNowOperation(['--target', 'preview', '--action', 'recover', '--key', 'k', '--etag', 'e'], env,
    async request => {
      assert.equal(new URL(request.url).origin, 'https://preview.geupddong.com')
      const body = await verifyIndexNowManageRequest(request, secret)
      assert.equal(body.confirm, false)
      return Response.json({ state: 'eligible', dryRun: true })
    })
  assert.equal(result.dryRun, true)
})
