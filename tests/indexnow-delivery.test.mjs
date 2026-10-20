import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createIndexNowDelivery, resolveIndexNowIntent, directoryHashes } from '../src/server/indexNowDelivery.ts'
import { canonicalIndexNowPaths } from '../src/server/indexNow.ts'
import { indexNowMemory } from './fixtures/indexnow-memory.mjs'
import { IndexNowRateLimitError } from '../src/server/indexNowRateLimit.ts'

const event = { toiletId: 177, revision: 2, action: 'UPSERT', catalogChanged: true }
const detail = { id: 177, name: '사직주유소', latitude: 37.575, longitude: 126.968,
  translations: { en: { name: 'Sajik Gas Station', roadAddress: '1 Sajik-ro' } } }
const before = { detail: async () => detail, district: async () => [detail] }
const options = { check: async () => {} }
const never = async () => { throw new Error('unexpected call') }

test('intent persistence failure prevents the subsequent cache mutation/acknowledgement', async () => {
  const f = indexNowMemory(), delivery = createIndexNowDelivery(f.bucket, f.now)
  f.bucket.put = async () => { throw new Error('storage unavailable') }
  let cacheMutations = 0, acknowledgements = 0
  await assert.rejects((async () => {
    const keys = await delivery.prepare([event], [], before)
    cacheMutations++
    await delivery.release(keys)
    acknowledgements++
  })(), /intent persistence failed/)
  assert.equal(cacheMutations, 0); assert.equal(acknowledgements, 0)
})

test('staged intents cannot be consumed until all cache persistence succeeds and release completes', async () => {
  const f = indexNowMemory(), delivery = createIndexNowDelivery(f.bucket, f.now)
  const keys = await delivery.prepare([event], [], before)
  assert.equal((await delivery.resolvePending(never, options)).completed, 0)
  await delivery.release(keys)
  assert.equal((await delivery.resolvePending(intent => resolveIndexNowIntent(intent,
    { detail: async () => ({ ...detail, name: '변경한 이름' }), district: never }), options)).completed, 1)
  const paths = f.records('indexnow/outbox/')[0].paths
  assert.ok(paths.some(path => path.includes('사직주유소')))
  assert.ok(paths.some(path => path.includes('변경한-이름')))
})

test('restart/retry preserves the original pre-invalidation paths without rereading the changed cache', async () => {
  const f = indexNowMemory(), delivery = createIndexNowDelivery(f.bucket, f.now)
  const keys = await delivery.prepare([event], [], before)
  const restarted = createIndexNowDelivery(f.bucket, f.now)
  assert.deepEqual(await restarted.prepare([event], [], { detail: never, district: never }), keys)
  await restarted.release(keys)
  await restarted.resolvePending(intent => resolveIndexNowIntent(intent,
    { detail: async () => null, district: never }), options)
  assert.deepEqual(f.records('indexnow/outbox/')[0].paths,
    canonicalIndexNowPaths(detail).sort())
})

test('release storage failure keeps the staged before-image and does not acknowledge completion', async () => {
  const f = indexNowMemory(), delivery = createIndexNowDelivery(f.bucket, f.now)
  const keys = await delivery.prepare([{ ...event, action: 'PRIVATE' }], [], before)
  const put = f.bucket.put
  f.bucket.put = async () => { throw new Error('offline') }
  await assert.rejects(delivery.release(keys), /offline/)
  assert.equal(f.records('indexnow/intents/')[0].state, 'staged')
  f.bucket.put = put
  await createIndexNowDelivery(f.bucket, f.now).release(keys)
  await delivery.resolvePending(intent => resolveIndexNowIntent(intent, { detail: never, district: never }), options)
  assert.ok(f.records('indexnow/outbox/')[0].paths.length > 0)
})

test('DELETE/PRIVATE retain only known previous URLs, never fabricate numeric routes or read current detail', async () => {
  for (const action of ['DELETE', 'PRIVATE']) {
    const known = { kind: 'detail', event: { ...event, action }, formerPaths: canonicalIndexNowPaths(detail).sort() }
    assert.deepEqual(await resolveIndexNowIntent(known, { detail: never, district: never }), known.formerPaths)
    assert.deepEqual(await resolveIndexNowIntent({ ...known, formerPaths: [] }, { detail: never, district: never }), [])
  }
})

test('district snapshots store only hashes, compare actual localized directory changes and skip unknown before-images', async () => {
  const intent = { kind: 'district', code: '11110', before: await directoryHashes([detail], '11110') }
  assert.ok(!JSON.stringify(intent).includes(detail.name))
  assert.deepEqual(await resolveIndexNowIntent(intent, { detail: never, district: async () => [detail] }), [])
  const changed = await resolveIndexNowIntent(intent,
    { detail: never, district: async () => [{ ...detail, name: '새 이름' }] })
  assert.equal(changed.length, 5)
  assert.ok(!changed.some(path => path.startsWith('/en/')))
  assert.deepEqual(await resolveIndexNowIntent({ ...intent, before: null }, { detail: never, district: never }), [])
})

test('origin failure stays retryable instead of silently dropping a facility or treating a district as empty', async () => {
  const f = indexNowMemory(), delivery = createIndexNowDelivery(f.bucket, f.now)
  await delivery.release(await delivery.prepare([event], [], before))
  assert.equal((await delivery.resolvePending(never, options)).deferred, 1)
  assert.equal(f.records('indexnow/outbox/').length, 0)
  f.advance(600_000)
  assert.equal((await delivery.resolvePending(async () => canonicalIndexNowPaths(detail), options)).completed, 1)
})

test('resolved paths survive a queue write failure even if the origin changes before retry', async () => {
  const f = indexNowMemory(), delivery = createIndexNowDelivery(f.bucket, f.now)
  await delivery.release(await delivery.prepare([event], [], before))
  const put = f.bucket.put
  f.bucket.put = async (key, ...args) => {
    if (key.startsWith('indexnow/outbox/')) throw new Error('queue write failed')
    return put(key, ...args)
  }
  assert.equal((await delivery.resolvePending(async () => canonicalIndexNowPaths(detail), options)).deferred, 1)
  f.bucket.put = put; f.advance(600_000)
  assert.equal((await delivery.resolvePending(never, options)).completed, 1)
})

test('cooldown arriving after an intent lease does not consume a retry or read the origin', async () => {
  const f = indexNowMemory(), delivery = createIndexNowDelivery(f.bucket, f.now)
  await delivery.release(await delivery.prepare([event], [], before))
  let checks = 0
  const retryAt = f.now() + 3_600_000
  assert.equal((await delivery.resolvePending(never, { check: async () => {
    if (++checks > 1) throw new IndexNowRateLimitError(retryAt)
  } })).deferred, 1)
  const stored = f.records('indexnow/intents/')[0]
  assert.equal(stored.attempts, 0)
  assert.equal(stored.dueAt, retryAt)
  assert.equal(stored.state, 'pending')
})

test('source route authenticates, stages, invalidates, releases, then acknowledges; only approved production has a schedule', () => {
  const route = readFileSync(new URL('../src/app/%255Finternal/cache/revalidate/route.ts', import.meta.url), 'utf8')
  assert.ok(route.indexOf('await authenticateRevalidation') < route.indexOf('await prepareDurableIndexNow'))
  assert.ok(route.indexOf('await prepareDurableIndexNow') < route.indexOf('worker: persistWorkerInvalidation'))
  assert.ok(route.indexOf("result.status === 'rejected'") < route.indexOf('await releaseDurable()'))
  assert.ok(route.indexOf('await releaseDurable()') < route.indexOf('return Response.json(acknowledgement'))
  const preview = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'))
  const production = JSON.parse(readFileSync(new URL('../wrangler.production.jsonc', import.meta.url), 'utf8'))
  assert.equal(preview.vars.INDEXNOW_OUTBOX_ENABLED, 'false')
  assert.deepEqual(preview.triggers?.crons ?? [], [])
  assert.equal(production.vars.INDEXNOW_OUTBOX_ENABLED, 'true')
  assert.deepEqual(production.triggers?.crons, ['*/10 * * * *'])
  for (const name of ['workers-validation.yml', 'review-api-validation.yml']) {
    const workflow = readFileSync(new URL('../.github/workflows/' + name, import.meta.url), 'utf8')
    const packages = workflow.split('\n').filter(line => line.includes('tar -czf') && line.includes('custom-worker.mjs'))
    assert.ok(packages.length > 0)
    assert.ok(packages.every(line => line.includes('indexnow-dispatch.mjs')))
  }
})
