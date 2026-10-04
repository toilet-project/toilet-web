import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlaceSearchRequest } from '../src/lib/placeSearchRequest.ts'

test('a newer keyword invalidates a non-abortable SDK result and aborts a fetch', () => {
  const gate = createPlaceSearchRequest()
  const old = gate.begin(), next = gate.begin()
  assert.equal(old.signal.aborted, true)
  assert.equal(old.isCurrent(), false)
  assert.equal(next.signal.aborted, false)
  assert.equal(next.isCurrent(), true)
})

test('blur, Escape, selection and disposal can invalidate a pending result immediately', () => {
  const gate = createPlaceSearchRequest()
  const pending = gate.begin()
  gate.cancel()
  gate.cancel()
  assert.equal(pending.signal.aborted, true)
  assert.equal(pending.isCurrent(), false)
  const reopened = gate.begin()
  assert.equal(reopened.isCurrent(), true)
  assert.equal(pending.isCurrent(), false)
})
