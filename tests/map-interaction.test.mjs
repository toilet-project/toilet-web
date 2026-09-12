import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createCardHandleGesture, createReferenceRequestGate, relayoutPreservingCenter } from '../src/lib/mapInteraction.ts'

test('resize restores the exact geographic center without pan, zoom or reference changes', () => {
  const center = { lat: 36.3668, lng: 127.3179 }
  let current = center
  const calls = []
  relayoutPreservingCenter({
    relayout() { calls.push('resize'); current = { lat: 0, lng: 0 } },
    setCenter(value) { calls.push('restore'); current = value },
  }, center)
  assert.equal(current, center)
  assert.deepEqual(calls, ['resize', 'restore'])
})

const point = (x, y, identifier = 1) => ({ clientX: x, clientY: y, identifier })
test('new reference and newer GPS requests invalidate a late GPS completion', () => {
  const gate = createReferenceRequestGate()
  const initial = gate.begin()
  gate.invalidate() // search/manual reference selected before GPS answers
  assert.equal(gate.isCurrent(initial), false)
  const old = gate.begin()
  const latest = gate.begin()
  assert.equal(gate.isCurrent(old), false)
  assert.equal(gate.isCurrent(latest), true)
  gate.invalidate() // map unmount
  assert.equal(gate.isCurrent(latest), false)
})
test('handle swipe expands once and ignores the synthetic click that follows', () => {
  const gesture = createCardHandleGesture()
  gesture.start([point(20, 100)])
  assert.equal(gesture.end([point(22, 40)], 1000), true)
  assert.equal(gesture.acceptsClick(1001), false)
  assert.equal(gesture.acceptsClick(1500), true)
  assert.equal(gesture.end([point(22, 0)]), false)
})
test('tap, diagonal, downward, cancelled and multi-touch gestures do not expand', () => {
  for (const end of [point(20, 90), point(80, 40), point(20, 160), point(20, 40, 2)]) {
    const gesture = createCardHandleGesture()
    gesture.start([point(20, 100)])
    assert.equal(gesture.end([end]), false)
  }
  for (const interrupt of ['cancel', 'pinch', 'two-finger-start']) {
    const gesture = createCardHandleGesture()
    gesture.start([point(20, 100)])
    if (interrupt === 'cancel') gesture.cancel()
    if (interrupt === 'pinch') gesture.move([point(20, 80), point(40, 80, 2)])
    if (interrupt === 'two-finger-start') gesture.start([point(20, 80), point(40, 80, 2)])
    assert.equal(gesture.end([point(20, 0)]), false)
  }
})
test('card reuse resets scroll; touch expansion belongs only to the handle', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /cardScrollRef.current.scrollTop = 0[\s\S]*?\[activeDetailId, cardHandleGesture\]/)
  assert.match(app, /ref=\{cardScrollRef\} className="card-scroll-content"/)
  assert.match(app, /className="mobile-card-handle"\s+onTouchStart/)
  assert.doesNotMatch(app, /cardTouchStartYRef/)
  assert.match(app, /onTouchCancel=\{\(\) => cardHandleGesture.cancel\(\)\}/)
})
test('all marker paths including the preview fixture block SDK touch propagation without disabling map zoom', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/components/mobile-navigation.css', import.meta.url), 'utf8')
  assert.equal((app.match(/addEventListener\('touchstart', suppressMapClickFromMarker/g) || []).length, 4)
  assert.equal((app.match(/clickable: true/g) || []).length, 4)
  assert.match(app, /window.kakao.maps.event.preventMap\(\)/)
  assert.match(css, /\.toilet-marker, \.coordinate-group-marker, \.cluster-marker, \.mobile-card-handle \{ touch-action: manipulation; \}/)
  assert.match(app, /const request = referenceRequestGate.begin\(\)/)
  assert.match(app, /\(\{ coords \}\) => \{\s+if \(!isCurrent\(\)\) return/)
  assert.match(app, /\(positionError\) => \{\s+if \(!isCurrent\(\)\) return/)
})
