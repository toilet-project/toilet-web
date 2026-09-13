import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { profilePhotoPolicyPublication, profilePhotoPolicyPublicationAttributes } from '../src/lib/profilePhotoPolicyPublication.ts'

test('profile-photo policy has an independent published audit marker', async () => {
  assert.equal(profilePhotoPolicyPublication.status, 'published')
  assert.equal(profilePhotoPolicyPublication.version, 'profile-photo-us-r2-public-v2')
  assert.equal(profilePhotoPolicyPublication.announcedAt, '2026-09-13T15:15:00Z')
  assert.equal(profilePhotoPolicyPublication.effectiveAt, '2026-09-13T15:15:00Z')
  const attributes = profilePhotoPolicyPublicationAttributes(profilePhotoPolicyPublication)
  assert.equal(attributes['data-profile-photo-policy-status'], 'published')
  assert.equal(attributes['data-profile-photo-policy-effective-at'], '2026-09-13T15:15:00Z')
  const page = await readFile(new URL('../src/components/PolicyPage.tsx', import.meta.url), 'utf8')
  assert.match(page, /프로필 사진 보관 정책 안내/)
  assert.doesNotMatch(page, /프로필 사진 기능을 운영하기 전에 고지·시행 시각을 확정할 검토안/)
  assert.match(page, /정책 공개만으로 사진 기능이 자동 활성화되지는 않습니다/)
})

test('profile-photo publication rejects malformed or inconsistent markers', () => {
  const value = { status: 'published', version: 'photo-v1', announcedAt: '2026-09-13T08:20:00Z', effectiveAt: '2026-09-13T08:20:00Z' }
  for (const change of [
    { version: '<photo>' }, { status: 'unknown' }, { effectiveAt: null },
    { announcedAt: '2026-09-13' }, { announcedAt: '2026-09-13T08:21:00Z' },
    { status: 'draft' },
  ]) assert.throws(() => profilePhotoPolicyPublicationAttributes({ ...value, ...change }))
})
