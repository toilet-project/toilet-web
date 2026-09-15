import assert from 'node:assert/strict'
import test from 'node:test'

process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID = 'G-TEST123'

const storage = new Map()
const appended = []
globalThis.window = {
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  },
  dispatchEvent() {},
  location: { hostname: 'geupddong.com', origin: 'https://geupddong.com' },
}
globalThis.document = {
  title: '급똥',
  cookie: '',
  getElementById: () => null,
  createElement: () => ({}),
  head: {
    append(script) {
      appended.push(script.src)
      script.onload?.()
    },
  },
}

const analytics = await import('../src/lib/analytics.ts')

test('Google tag is not requested before opt-in or after refusal', async () => {
  await analytics.loadGoogleAnalytics()
  assert.deepEqual(appended, [])

  storage.set(analytics.ANALYTICS_CONSENT_KEY, 'denied')
  await analytics.loadGoogleAnalytics()
  assert.deepEqual(appended, [])
})

test('Google tag loads once after explicit analytics consent', async () => {
  storage.set(analytics.ANALYTICS_CONSENT_KEY, 'granted')
  await analytics.loadGoogleAnalytics()
  await analytics.loadGoogleAnalytics()

  assert.equal(appended.length, 1)
  assert.match(appended[0], /googletagmanager\.com\/gtag\/js\?id=G-TEST123/)
  assert.ok(window.dataLayer.length >= 3)
})
