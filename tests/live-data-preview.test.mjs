import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const source = stripTypeScriptTypes(readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8'))
  .replace('export default config', 'globalThis.result = config')
const real = { SITE_INDEXABLE: 'false', REVIEW_API_ENABLED: 'true', REVIEW_LIVE_PREVIEW_APPROVED: 'true',
  NEXT_PUBLIC_API_BASE_URL: 'https://api.geupddong.com', TOILET_ENGAGEMENT_ENABLED: 'true' }
const configFor = env => { const scope = { process: { env } }; runInNewContext(source, scope); return scope.result }

test('approved live preview enables real members without fixture rewrites or indexing', async () => {
  const config = configFor(real)
  assert.equal(config.env.NEXT_PUBLIC_REVIEW_API_ENABLED, 'true')
  assert.equal(config.env.NEXT_PUBLIC_TOILET_ENGAGEMENT_ENABLED, 'true')
  assert.equal(config.env.NEXT_PUBLIC_REVIEW_DESIGN_PREVIEW, 'false')
  assert.ok((await config.headers()).some(row => row.headers.some(h => h.key === 'X-Robots-Tag' && h.value === 'noindex, nofollow')))
  assert.ok(!(await config.rewrites()).some(row => row.destination.startsWith('/review-verification/')))
})

test('live preview fails closed without each exact approval, API and preview gate', () => {
  for (const change of [{ REVIEW_LIVE_PREVIEW_APPROVED: undefined }, { REVIEW_API_ENABLED: 'false' },
    { SITE_INDEXABLE: 'true' }, { SITE_INDEXABLE: undefined },
    { NEXT_PUBLIC_API_BASE_URL: 'https://api.geupddong.com.evil.invalid' }]) {
    const config = configFor({ ...real, ...change })
    assert.equal(config.env.NEXT_PUBLIC_REVIEW_API_ENABLED, 'false')
    assert.equal(config.env.NEXT_PUBLIC_TOILET_ENGAGEMENT_ENABLED, 'false')
  }
  assert.equal(configFor({ ...real, TOILET_ENGAGEMENT_ENABLED: 'false' }).env.NEXT_PUBLIC_TOILET_ENGAGEMENT_ENABLED, 'false')
})

test('synthetic preview remains isolated and production still needs its separate approval', async () => {
  const fixture = configFor({ ...real, REVIEW_LIVE_PREVIEW_APPROVED: undefined, NEXT_PUBLIC_API_BASE_URL: 'https://preview.geupddong.com/__review-verification' })
  assert.equal(fixture.env.NEXT_PUBLIC_REVIEW_API_ENABLED, 'true')
  assert.ok((await fixture.rewrites()).some(row => row.destination.startsWith('/review-verification/')))
  const production = configFor({ ...real, SITE_INDEXABLE: 'true', REVIEW_LIVE_PREVIEW_APPROVED: undefined, REVIEW_PRODUCTION_APPROVED: 'true' })
  assert.equal(production.env.NEXT_PUBLIC_REVIEW_API_ENABLED, 'true')
  assert.ok(!(await production.headers()).some(row => row.headers.some(h => h.key === 'X-Robots-Tag')))
})
