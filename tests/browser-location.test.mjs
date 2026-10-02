import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { requestBrowserLocation } from '../src/lib/browserLocation.ts'

const point = { coords: { latitude: 36.3, longitude: 127.3 } }
test('fresh GPS request bypasses a stale cached position and resolves normally', async () => {
  let options
  const geo = { getCurrentPosition(ok, _error, opts) { options = opts; ok(point) } }
  assert.equal(await requestBrowserLocation(geo, new AbortController().signal), point)
  assert.equal(options.maximumAge, 0)
  assert.equal(options.enableHighAccuracy, true)
})
test('silent browser callback times out, tries a fresh coarse fix once, and terminates', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const calls = []
  const pending = requestBrowserLocation({ getCurrentPosition(ok, fail, options) { calls.push({ ok, fail, options }) } }, new AbortController().signal)
  const rejected = assert.rejects(pending, error => error.code === 3)
  t.mock.timers.tick(8000); assert.equal(calls.length, 2)
  assert.equal(calls[1].options.enableHighAccuracy, false)
  calls[0].ok(point) // Late high-accuracy response cannot settle the replacement request.
  t.mock.timers.tick(5000); await rejected
  t.mock.timers.tick(60000); assert.equal(calls.length, 2)
})
test('fallback resolves; permission denial does not retry', async () => {
  let calls = 0
  const fallback = { getCurrentPosition(ok, fail) { if (++calls === 1) fail({ code: 2 }); else ok(point) } }
  assert.equal(await requestBrowserLocation(fallback, new AbortController().signal), point)
  assert.equal(calls, 2); calls = 0
  await assert.rejects(requestBrowserLocation({ getCurrentPosition(_ok, fail) { calls++; fail({ code: 1 }) } }, new AbortController().signal), error => error.code === 1)
  assert.equal(calls, 1)
})
test('cancelled tab/map request ignores late callbacks and clears its retry deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let calls = 0, finish
  const controller = new AbortController()
  const result = requestBrowserLocation({ getCurrentPosition(ok) { calls++; finish = ok } }, controller.signal)
  const rejected = assert.rejects(result, { name: 'AbortError' })
  controller.abort(); finish(point); t.mock.timers.tick(20000); await rejected
  assert.equal(calls, 1)
})
test('map resume refreshes GPS without moving the saved camera and cannot await permissions indefinitely', async () => {
  const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /await navigator\.permissions\.query/)
  assert.match(source, /updateCurrentLocation\(coordinates, !preserveViewport\)/)
  assert.match(source, /snapshot\?\.source \?\? resume\?\.source[\s\S]*moveToCurrentLocation\(true, true\)/)
  assert.match(source, /addEventListener\('pageshow', resumeLocation\)/)
  assert.match(source, /addEventListener\('visibilitychange', visibility\)/)
  assert.ok(source.indexOf('void moveToCurrentLocation(true)') < source.indexOf('await loadMapArea()', source.indexOf('async function initialize()')))
})
