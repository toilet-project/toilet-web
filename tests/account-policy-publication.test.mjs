import assert from 'node:assert/strict'
import test from 'node:test'
import { accountPolicyPublication, policyPublicationAttributes } from '../src/lib/accountPolicyPublication.ts'

test('approved release explicitly separates publication and effective instants', () => {
  assert.equal(accountPolicyPublication.status, 'published')
  assert.equal(accountPolicyPublication.announcedAt, '2026-09-10T08:45:00Z')
  assert.equal(policyPublicationAttributes(accountPolicyPublication)['data-account-policy-effective-at'], '2026-09-10T09:00:00Z')
  assert.ok(Date.parse(accountPolicyPublication.announcedAt) < Date.parse(accountPolicyPublication.effectiveAt))
})
test('publication has explicit version and UTC instants, displayed in Korean time by the page', () => {
  const value = { status: 'published', version: 'synthetic-v1', announcedAt: '2026-09-01T00:00:00Z', effectiveAt: '2026-09-08T00:00:00Z' }
  assert.equal(policyPublicationAttributes(value)['data-account-policy-status'], 'published')
  for (const change of [{ effectiveAt: null }, { effectiveAt: '2026-09-08' }, { effectiveAt: '2026-02-30T00:00:00Z' },
    { announcedAt: '2026-09-09T00:00:00Z' }, { version: '<script>' }, { status: 'unknown' }, { status: 'draft' }]) {
    assert.throws(() => policyPublicationAttributes({ ...value, ...change }))
  }
})
