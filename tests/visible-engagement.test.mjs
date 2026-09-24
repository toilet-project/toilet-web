import test from 'node:test'
import assert from 'node:assert/strict'
import { createVisibleEngagementClock, observeVisibleEngagement, ENGAGEMENT_HEARTBEAT_MS } from '../src/lib/visible-engagement.ts'

test('hidden intervals and repeated pagehide do not add or duplicate engagement', () => {
  let now = 0
  const clock = createVisibleEngagementClock(() => now, true)
  now = 12_400
  clock.setActive(false)
  assert.equal(clock.drainSeconds(), 12)
  now += 60 * 60 * 1000
  assert.equal(clock.drainSeconds(), 0)
  clock.setActive(true)
  now += 5_600
  clock.setActive(false)
  assert.equal(clock.drainSeconds(), 6)
  assert.equal(clock.drainSeconds(), 0)
})

test('a page opened in the background starts only after focus; heartbeats send deltas', () => {
  let now = 0
  const clock = createVisibleEngagementClock(() => now, false)
  now = 300_000
  assert.equal(clock.drainSeconds(), 0)
  clock.setActive(true)
  now += 30_000
  assert.equal(clock.drainSeconds(), 30)
  now += 30_000
  assert.equal(clock.drainSeconds(), 30)
  clock.setActive(false)
  now += 180_000
  clock.setActive(true)
  now += 2_000
  assert.equal(clock.drainSeconds(), 2)
})

function environment({ visible = true, focused = true } = {}) {
  let now = 0
  let timer = null
  const pageDocument = new EventTarget()
  const pageWindow = new EventTarget()
  pageDocument.visibilityState = visible ? 'visible' : 'hidden'
  pageDocument.hasFocus = () => focused
  pageWindow.performance = { now: () => now }
  pageWindow.setInterval = (callback, interval) => {
    assert.equal(interval, ENGAGEMENT_HEARTBEAT_MS)
    assert.equal(timer, null)
    timer = callback
    return 1
  }
  pageWindow.clearInterval = id => { assert.equal(id, 1); timer = null }
  const received = []
  const stop = observeVisibleEngagement(seconds => received.push(seconds), pageDocument, pageWindow)
  return {
    pageDocument, pageWindow, received, stop,
    advance: milliseconds => { now += milliseconds },
    tick: () => timer?.(),
    visibility: visible => {
      pageDocument.visibilityState = visible ? 'visible' : 'hidden'
      pageDocument.dispatchEvent(new Event('visibilitychange'))
    },
    focus: value => { focused = value; pageWindow.dispatchEvent(new Event(value ? 'focus' : 'blur')) },
    event: name => (['freeze', 'resume'].includes(name) ? pageDocument : pageWindow).dispatchEvent(new Event(name)),
    hasTimer: () => timer !== null,
  }
}

test('10 seconds active, an hour hidden, and 5 seconds active sends exactly 15', () => {
  const env = environment()
  env.advance(10_000)
  env.visibility(false)
  env.focus(false)
  env.advance(3_600_000)
  env.tick()
  env.visibility(true) // visible before focus must not start counting
  env.advance(8_000)
  env.focus(true)
  env.advance(5_000)
  env.stop()
  assert.deepEqual(env.received, [10, 5])
})

test('blur immediately pauses even if hasFocus still reports true during dispatch', () => {
  const env = environment()
  env.advance(2_000)
  env.event('blur')
  env.advance(9_000)
  env.focus(true)
  env.advance(3_000)
  env.stop()
  assert.deepEqual(env.received, [2, 3])
})

test('pagehide, freeze, and focus cannot restart a suspended page before pageshow', () => {
  const env = environment()
  env.advance(7_000)
  env.event('pagehide')
  env.event('freeze')
  env.focus(true)
  env.advance(600_000)
  env.tick()
  assert.deepEqual(env.received, [7])
  env.event('pageshow')
  env.event('resume')
  env.advance(4_000)
  env.event('pagehide')
  env.stop()
  env.stop()
  assert.deepEqual(env.received, [7, 4])
})

test('initial background tab and frozen heartbeat send nothing until active', () => {
  const env = environment({ visible: false, focused: false })
  env.advance(600_000)
  env.tick()
  env.focus(true)
  env.advance(5_000)
  env.tick()
  assert.deepEqual(env.received, [])
  env.visibility(true)
  env.advance(30_000)
  env.tick()
  env.advance(30_000)
  env.tick()
  env.stop()
  assert.deepEqual(env.received, [30, 30])
})

test('route cleanup removes timers and listeners and cannot submit again', () => {
  const env = environment()
  env.advance(1_500)
  env.stop()
  assert.equal(env.hasTimer(), false)
  env.advance(100_000)
  env.event('pageshow')
  env.event('resume')
  env.focus(true)
  env.tick()
  env.visibility(false)
  env.stop()
  assert.deepEqual(env.received, [1])
})

test('short visibility changes keep fractional seconds, not round each segment upward', () => {
  const env = environment()
  for (let i = 0; i < 4; i++) {
    env.advance(400)
    env.focus(false)
    env.advance(10_000)
    env.focus(true)
  }
  env.stop()
  assert.deepEqual(env.received, [1])
})
