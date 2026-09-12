import assert from 'node:assert/strict'
import test from 'node:test'
import { decodePhoto, ownPhotoPath, reviewPhotoPath } from '../src/lib/profilePhoto.ts'
test('photo state fails closed and strips unexpected identity fields', () => {
  const valid = { available: true, useSocial: true, publicPhoto: false, imageVersion: '12345678-1234-1234-1234-123456789abc' }
  assert.deepEqual(decodePhoto({ ...valid, email: 'private@example.test' }), valid)
  for (const bad of [{}, { ...valid, useSocial: false }, { ...valid, imageVersion: 'https://evil.test/a' }, { ...valid, publicPhoto: 'false' }]) assert.throws(() => decodePhoto(bad))
})
test('photo URLs cannot escape fixed API routes or expose member identifiers', () => {
  assert.equal(ownPhotoPath('../secret'), null)
  assert.equal(reviewPhotoPath(1, '../../member'), null)
  assert.equal(reviewPhotoPath(-1, '2'), null)
  assert.equal(reviewPhotoPath(1, '2'), '/api/v1/toilets/1/reviews/2/photo')
})
