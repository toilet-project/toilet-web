import assert from 'node:assert/strict'
import test from 'node:test'
import { clampCropOffset, clampPhotoZoom, createCropGeometry } from '../src/lib/profilePhotoCrop.ts'

test('landscape photos stay inside a square crop while horizontal movement is clamped', () => {
  assert.deepEqual(clampCropOffset(1200, 800, 320, 1, { x: 999, y: 999 }), { x: 80, y: 0 })
  const crop = createCropGeometry(1200, 800, 320, 1, { x: 80, y: 10 })
  assert.deepEqual(crop, { drawWidth: 480, drawHeight: 320, drawX: 0, drawY: 0, sourceX: 0, sourceY: 0, sourceSize: 800 })
})

test('portrait photos can move vertically and zoom never exposes an empty edge', () => {
  assert.deepEqual(clampCropOffset(800, 1200, 320, 1, { x: -20, y: -999 }), { x: 0, y: -80 })
  const crop = createCropGeometry(800, 1200, 320, 2, { x: 999, y: -999 })
  assert.equal(crop.drawX, 0)
  assert.equal(crop.drawY, -640)
  assert.equal(crop.sourceX, 0)
  assert.equal(crop.sourceY, 800)
  assert.equal(crop.sourceSize, 400)
})

test('zoom input is constrained to the supported mobile editing range', () => {
  assert.equal(clampPhotoZoom(-10), 1)
  assert.equal(clampPhotoZoom(1.75), 1.75)
  assert.equal(clampPhotoZoom(9), 3)
})
