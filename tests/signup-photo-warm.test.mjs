import assert from 'node:assert/strict'
import test from 'node:test'
import { refreshSignupPhoto, SIGNUP_PHOTO_WARM_DELAYS_MS } from '../src/lib/signupPhotoWarm.ts'

const ready = { available: true, publicPhoto: true, imageVersion: '12345678-1234-1234-1234-123456789abc' }
const pending = { available: false, publicPhoto: false, imageVersion: null }

test('new signup photo is accepted and stops polling as soon as its version is ready', async () => {
  const profiles = [{ profilePhoto: pending }, { profilePhoto: pending }, { profilePhoto: ready }]
  const delays = []
  const accepted = []
  await refreshSignupPhoto(
    async () => profiles.shift() ?? null,
    (profile) => { accepted.push(profile); return true },
    async (milliseconds) => { delays.push(milliseconds) },
  )
  assert.deepEqual(delays, SIGNUP_PHOTO_WARM_DELAYS_MS.slice(0, 3))
  assert.equal(accepted.length, 3)
  assert.equal(accepted.at(-1).profilePhoto.imageVersion, ready.imageVersion)
})

test('a slow signup import remains observable for about one minute', async () => {
  const delays = []
  await refreshSignupPhoto(
    async () => ({ profilePhoto: pending }),
    () => true,
    async (milliseconds) => { delays.push(milliseconds) },
  )
  assert.deepEqual(delays, SIGNUP_PHOTO_WARM_DELAYS_MS)
  assert.ok(delays.reduce((total, delay) => total + delay, 0) >= 60_000)
})

test('signup photo polling stops when the session changes or a read fails', async () => {
  let loads = 0
  await refreshSignupPhoto(async () => { loads += 1; return { profilePhoto: pending } }, () => false, async () => {})
  assert.equal(loads, 1)

  await refreshSignupPhoto(async () => { throw new Error('session unavailable') }, () => true, async () => {})
})
