import test from 'node:test'
import assert from 'node:assert/strict'
import { compactOverviewViewport, constrainAtlas, initialAtlasViewport, zoomAtlas } from '../src/lib/regionAtlasViewport.ts'

test('wheel zoom preserves the geographic point beneath the cursor', () => {
  const before = { scale: 2, x: -250, y: -200 }
  const cursor = { x: 300, y: 350 }
  const after = zoomAtlas(before, 3, cursor, 760, 800)
  assert.equal((cursor.x - before.x) / before.scale, (cursor.x - after.x) / after.scale)
  assert.equal((cursor.y - before.y) / before.scale, (cursor.y - after.y) / after.scale)
})

test('pinch zoom follows a moving midpoint', () => {
  const before = { scale: 2, x: -300, y: -350 }
  const after = zoomAtlas(before, 4, { x: 300, y: 400 }, 760, 800, { x: 350, y: 450 })
  assert.deepEqual(after, { scale: 4, x: -850, y: -1050 })
})

test('panning stays within the atlas and zooming all the way out restores it', () => {
  assert.deepEqual(constrainAtlas({ scale: 2, x: 200, y: -3000 }, 760, 800), { scale: 2, x: 0, y: -800 })
  assert.equal(zoomAtlas(initialAtlasViewport, 40, { x: 380, y: 400 }, 760, 800).scale, 8)
  assert.deepEqual(zoomAtlas({ scale: 3, x: -900, y: -500 }, .1, { x: 100, y: 200 }, 760, 800), initialAtlasViewport)
})

test('compact country fit keeps the full vertical extent visible on phones', () => {
  for (const [screenWidth, screenHeight] of [[366, 706], [296, 502], [370, 310]]) {
    const view = compactOverviewViewport(760, 800, screenWidth, screenHeight)
    const fit = Math.min(screenWidth / 760, screenHeight / 800)
    assert.ok(view.scale >= 1 && view.scale <= 1.65)
    assert.ok(800 * fit * view.scale <= screenHeight)
    assert.equal(view.x, 760 * (1 - view.scale) / 2)
  }
})
