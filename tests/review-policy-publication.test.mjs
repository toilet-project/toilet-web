import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { reviewPolicyPublication, reviewPolicyPublicationAttributes } from '../src/lib/reviewPolicyPublication.ts'

test('review publication has its own explicit audit marker', async () => {
  assert.equal(reviewPolicyPublication.status, 'published')
  assert.equal(reviewPolicyPublication.version, 'location-verified-reviews-v1')
  assert.equal(reviewPolicyPublication.announcedAt, '2026-09-12T09:30:00Z')
  assert.equal(reviewPolicyPublication.effectiveAt, '2026-09-12T09:30:00Z')
  const attributes = reviewPolicyPublicationAttributes(reviewPolicyPublication)
  assert.equal(attributes['data-review-policy-status'], 'published')
  assert.equal(attributes['data-review-policy-effective-at'], '2026-09-12T09:30:00Z')
  const page = await readFile(new URL('../src/components/PolicyPage.tsx', import.meta.url), 'utf8')
  assert.match(page, /리뷰 기능 정책 안내/)
  assert.match(page, /정책 공개만으로 자동 활성화되지 않습니다/)
})

test('review publication rejects malformed or inconsistent markers', () => {
  const value = { status: 'published', version: 'review-v1', announcedAt: '2026-09-12T09:30:00Z', effectiveAt: '2026-09-12T09:30:00Z' }
  for (const change of [
    { version: '<review>' }, { status: 'unknown' }, { effectiveAt: null },
    { announcedAt: '2026-09-12' }, { announcedAt: '2026-09-12T09:31:00Z' },
    { status: 'draft' },
  ]) assert.throws(() => reviewPolicyPublicationAttributes({ ...value, ...change }))
})
