import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reviewVerificationResponse } from '../review-verification-proxy.mjs'
const base = 'https://preview.geupddong.com/__review-verification'
const env = () => ({ SITE_INDEXABLE: 'false', REVIEW_VERIFICATION_ORIGIN: 'https://synthetic-only-fixture.trycloudflare.com', REVIEW_VERIFICATION_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString() })
test('temporary proxy is inaccessible on production, absent configuration, expiration or non-allowlisted paths', async () => {
  assert.equal(await reviewVerificationResponse(new Request('https://geupddong.com/'), {}), null)
  for (const config of [{}, { ...env(), SITE_INDEXABLE: 'true' }, { ...env(), REVIEW_VERIFICATION_EXPIRES_AT: '2000-01-01' }, { ...env(), REVIEW_VERIFICATION_ORIGIN: 'https://api.geupddong.com' }]) {
    const response = await reviewVerificationResponse(new Request(base + '/api/v1/auth/me'), config)
    assert.ok(response.status >= 400)
  }
  for (const path of ['/api/v1/auth/me/profile', '/api/v1/admin/users', '/actuator/env']) {
    assert.equal((await reviewVerificationResponse(new Request(base + path), env())).status, 403)
  }
  assert.equal((await reviewVerificationResponse(new Request(base.replace('preview.', '') + '/api/v1/auth/me'), env())).status, 404)
})
test('only synthetic gateway receives requests; real cookies and authorization never leave the Worker', async () => {
  const original = globalThis.fetch; const calls = []
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return Response.json({ synthetic: true }, { headers: { 'Set-Cookie': 'forbidden=value', 'Access-Control-Allow-Origin': '*' } }) }
  try {
    const request = new Request(base + '/api/v1/reviews', { method: 'POST', headers: { Origin: 'https://preview.geupddong.com', Cookie: 'real-cookie=never-forward', Authorization: 'Bearer never-forward', 'Content-Type': 'application/json', 'Idempotency-Key': 'aaaaaaaa-1111-1111-1111-111111111111' }, body: '{}' })
    const response = await reviewVerificationResponse(request, env())
    assert.equal(response.status, 200); assert.equal(calls.length, 1)
    assert.equal(calls[0].url, env().REVIEW_VERIFICATION_ORIGIN + '/api/v1/reviews')
    assert.equal(calls[0].options.headers.get('Cookie'), null); assert.equal(calls[0].options.headers.get('Authorization'), null)
    assert.equal(calls[0].options.cache, 'no-store')
    assert.equal(response.headers.get('Set-Cookie'), null); assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  } finally { globalThis.fetch = original }
})
test('synthetic SSR uses the same bounded proxy instead of a production facility or persistent cache', () => {
  const source = readFileSync(new URL('../src/server/toilets.ts', import.meta.url), 'utf8')
  assert.match(source, /NEXT_PUBLIC_REVIEW_API_ENABLED === 'true'/)
  assert.match(source, /NEXT_PUBLIC_API_BASE_URL === 'https:\/\/preview\.geupddong\.com\/__review-verification'/)
  const fixture = source.slice(source.indexOf('if (verification)'), source.indexOf('} else {'))
  assert.match(fixture, /reviewVerificationResponse/)
  assert.doesNotMatch(fixture, /TOILET_API_ORIGIN|api\.geupddong\.com|revalidate:/)
})
test('mutations require same origin and a bounded JSON body; redirects never escape sandbox', async () => {
  const original = globalThis.fetch; let calls = 0
  globalThis.fetch = async () => { calls++; return Response.redirect('https://api.geupddong.com', 302) }
  try {
    const request = (headers, body = '{}') => new Request(base + '/api/v1/reviews', { method: 'POST', headers, body })
    assert.equal((await reviewVerificationResponse(request({ 'Content-Type': 'application/json' }), env())).status, 403)
    const headers = { Origin: 'https://preview.geupddong.com', 'Content-Type': 'application/json' }
    assert.equal((await reviewVerificationResponse(request(headers, 'x'.repeat(8193)), env())).status, 413)
    assert.equal(calls, 0)
    assert.equal((await reviewVerificationResponse(request(headers), env())).status, 502); assert.equal(calls, 1)
  } finally { globalThis.fetch = original }
})
