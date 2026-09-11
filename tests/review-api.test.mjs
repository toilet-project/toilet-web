import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createReviewApi, decodeReview, ReviewApiError } from '../src/lib/reviewApi.ts'
import { canManageReview } from '../src/lib/review.ts'

const record = () => ({ id: '1', toiletId: 12, toiletName: '가상 화장실', satisfaction: 4, cleanliness: 5, paper: true, waitMinutes: 0, comment: '합성 리뷰', version: 0,
  createdAt: '2026-09-12T00:00:00+09:00', updatedAt: '2026-09-12T00:00:00+09:00', editableUntil: '2026-09-19T00:00:00+09:00', canManage: true, authorRemoved: false, authorDisplayName: '시험 사용자' })
const key = '00000000-0000-4000-8000-000000000001'
const position = { latitude: 36.3, longitude: 127.3, accuracyMeters: 10, measuredAt: '2026-09-12T00:00:00Z' }
const range = { period: '7', from: '2026-09-06', to: '2026-09-12' }
function setup(responses) {
  const calls = []
  const request = async (url, options) => { calls.push({ url, options }); const next = responses.shift(); if (next instanceof Error) throw next; return next }
  return { calls, api: createReviewApi({ url: p => `https://fixture.invalid${p}`, read: url => request(url, { method: 'GET', credentials: 'include', cache: 'no-store' }), request }) }
}
const response = (value, status = 200) => Response.json(value, { status })
test('review response is strict and strips unneeded identity fields', () => {
  assert.deepEqual(decodeReview({ ...record(), email: 'never-store', position }), record())
  for (const change of [{ paper: 'true' }, { satisfaction: 4.5 }, { id: '../me' }, { createdAt: '2026-09-12T00:00:00' }, { canManage: undefined }, { comment: '🙂'.repeat(201) }]) assert.throws(() => decodeReview({ ...record(), ...change }), ReviewApiError)
  assert.equal(canManageReview({ ...record(), canManage: false }, Date.parse(record().createdAt)), false)
})
test('real create sends only allowlisted content and transient location, with one stable request key', async () => {
  const { api, calls } = setup([response(record())])
  await api.create(12, { ...record(), email: 'must-not-leak' }, position, key)
  const { url, options } = calls[0]
  assert.equal(url, 'https://fixture.invalid/api/v1/reviews')
  assert.equal(options.method, 'POST'); assert.equal(options.credentials, 'include'); assert.equal(options.cache, 'no-store')
  assert.equal(options.headers['Idempotency-Key'], key)
  assert.deepEqual(JSON.parse(options.body), { toiletId: 12, satisfaction: 4, cleanliness: 5, paper: true, waitMinutes: 0, comment: '합성 리뷰', position })
  assert.equal(calls.length, 1)
})
test('write transport errors and 401 never automatically replay a mutation or claim success', async () => {
  for (const result of [new TypeError('sensitive-network-details'), response({ error: {} }, 401), response({ unexpected: true })]) {
    const { api, calls } = setup([result])
    await assert.rejects(api.create(12, record(), position, key), ReviewApiError)
    assert.equal(calls.length, 1)
  }
})
test('frequency check supports existing/anonymous/available states; malformed results never allow new writes', async () => {
  const nextAllowedAt = '2026-09-13T00:00:00+09:00'
  for (const state of [{ canCreate: true, existingReviewId: null, nextAllowedAt: null }, { canCreate: false, existingReviewId: '1', nextAllowedAt }, { canCreate: false, existingReviewId: null, nextAllowedAt }]) {
    const { api } = setup([response(state)]); assert.deepEqual(await api.status(12), state)
  }
  for (const state of [{}, { canCreate: true, existingReviewId: '1', nextAllowedAt }, { canCreate: false, existingReviewId: null, nextAllowedAt: null }]) {
    const { api } = setup([response(state)]); await assert.rejects(api.status(12), ReviewApiError)
  }
})
test('duplicate response returns only a validated existing review ID and fixed safe message', async () => {
  const { api } = setup([response({ error: { code: 'REVIEW_ALREADY_EXISTS', message: 'sensitive input', existingReviewId: '123' } }, 409)])
  await assert.rejects(api.create(12, record(), position, key), error => error.code === 'REVIEW_ALREADY_EXISTS' && error.existingReviewId === '123' && !error.message.includes('sensitive'))
})
test('date filters and server cursor use ten-item requests; duplicate and looping pages fail closed', async () => {
  const page = { items: [record()], nextCursor: 'fixture-cursor', hasMore: true }
  const { api, calls } = setup([response(page), response({ items: [], nextCursor: null, hasMore: false })])
  assert.deepEqual(await api.mine(range), page)
  await api.mine({ ...range, period: 'all' }, page.nextCursor)
  assert.equal(new URL(calls[0].url).searchParams.get('size'), '10'); assert.equal(new URL(calls[0].url).searchParams.get('from'), range.from)
  assert.equal(new URL(calls[1].url).searchParams.has('from'), false); assert.equal(new URL(calls[1].url).searchParams.get('cursor'), 'fixture-cursor')
  for (const bad of [{ ...page, items: [record(), record()] }, { ...page, items: [] }, { ...page, hasMore: false }]) {
    const { api } = setup([response(bad)]); await assert.rejects(api.mine(range), ReviewApiError)
  }
  const looping = setup([response(page)]); await assert.rejects(looping.api.mine(range, 'fixture-cursor'), ReviewApiError)
})
test('edit and detach carry server version; unconfirmed or malformed detach never counts as success', async () => {
  const { api, calls } = setup([response({ ...record(), version: 1 }), response({ id: '1', authorDisplayName: '익명', contentRetained: true })])
  await api.edit(record(), record()); await api.detach({ ...record(), version: 1 })
  assert.equal(JSON.parse(calls[0].options.body).version, 0)
  assert.equal('position' in JSON.parse(calls[0].options.body), false)
  assert.deepEqual(JSON.parse(calls[1].options.body), { version: 1, acknowledgeContentRetention: true })
  const bad = setup([response({ id: '1', contentRetained: false })]); await assert.rejects(bad.api.detach(record()), ReviewApiError)
})
test('fixture IDs never reach real API and detached or mismatched detail is rejected', async () => {
  const { api, calls } = setup([])
  await assert.rejects(api.status(-1), /테스트/); await assert.rejects(api.create(-1, record(), position, key), /테스트/)
  assert.equal(calls.length, 0)
  for (const value of [{ ...record(), authorRemoved: true }, { ...record(), id: '2' }]) {
    const { api } = setup([response(value)]); await assert.rejects(api.detail('1'), ReviewApiError)
  }
})
test('real integration stays opt-in and production remains disabled; no memory fallback or persisted GPS', () => {
  const config = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8')
  const hook = readFileSync(new URL('../src/components/reviews/useReviewApi.tsx', import.meta.url), 'utf8')
  assert.match(config, /NEXT_PUBLIC_REVIEW_API_ENABLED: process.env.SITE_INDEXABLE === 'false' && process.env.REVIEW_API_ENABLED === 'true'/)
  assert.doesNotMatch(hook, /localStorage|sessionStorage|console\.|setReviews|useIntegratedReviewPreview\(/)
  assert.match(hook, /attempt.current.key/); assert.match(hook, /await reviewApi.detach\(item\)/)
  assert.match(hook, /if \(!current\(token\)\) return/)
})
