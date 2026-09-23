import assert from 'node:assert/strict'
import test from 'node:test'
import { trackEvent, trackPageView } from '../src/lib/analytics.ts'

test('blocked session storage keeps one entry event and session ID until inactivity', () => {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  const originalFetch = globalThis.fetch
  const originalNow = Date.now
  const events = []
  let now = Date.parse('2026-09-23T03:00:00Z')
  const blocked = () => { throw new Error('storage denied') }

  try {
    Date.now = () => now
    globalThis.window = {
      location: { href: 'https://geupddong.com/' },
      sessionStorage: { getItem: blocked, setItem: blocked, removeItem: blocked },
      localStorage: { getItem: blocked, setItem: blocked },
    }
    globalThis.document = { referrer: '' }
    globalThis.fetch = (_url, options) => {
      events.push(JSON.parse(options.body))
      return Promise.resolve({ ok: true })
    }

    trackPageView('/')
    trackEvent('screen_view', { screen: 'account_home', path: '/' })
    trackPageView('/account')
    assert.deepEqual(events.map(({ event }) => event), ['session_start', 'page_view', 'screen_view', 'page_view'])
    assert.equal(new Set(events.map(({ sessionId }) => sessionId)).size, 1)

    now += 31 * 60 * 1000
    trackPageView('/account')
    assert.deepEqual(events.slice(4).map(({ event }) => event), ['session_start', 'page_view'])
    assert.notEqual(events[0].sessionId, events[4].sessionId)
    assert.equal(events[4].path, '/account')
  } finally {
    Date.now = originalNow
    globalThis.window = originalWindow
    globalThis.document = originalDocument
    globalThis.fetch = originalFetch
  }
})

test('a new tagged arrival in the same tab starts a new attributed session', () => {
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  const originalFetch = globalThis.fetch
  const originalNow = Date.now
  const events = []
  const storage = new Map()

  try {
    Date.now = () => Date.parse('2026-09-23T04:00:00Z')
    globalThis.window = {
      location: { href: 'https://geupddong.com/?utm_source=naver&utm_medium=organic' },
      sessionStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
      localStorage: { getItem: () => null, setItem: () => undefined },
    }
    globalThis.document = { referrer: 'https://search.naver.com/search.naver?query=private' }
    globalThis.fetch = (_url, options) => {
      events.push(JSON.parse(options.body))
      return Promise.resolve({ ok: true })
    }

    trackPageView('/')
    globalThis.window.location.href = 'https://geupddong.com/toilet/123'
    trackPageView('/toilet/123')
    assert.equal(events.filter(({ event }) => event === 'session_start').length, 1)

    globalThis.window.location.href = 'https://geupddong.com/?utm_source=kakao&utm_medium=social'
    globalThis.document.referrer = 'https://www.kakao.com/'
    trackPageView('/')
    const starts = events.filter(({ event }) => event === 'session_start')
    assert.equal(starts.length, 2)
    assert.notEqual(starts[0].sessionId, starts[1].sessionId)
    assert.equal(starts[1].utmSource, 'kakao')
  } finally {
    Date.now = originalNow
    globalThis.window = originalWindow
    globalThis.document = originalDocument
    globalThis.fetch = originalFetch
  }
})
