import assert from 'node:assert/strict'
import test from 'node:test'
import { provinces, districtsIn, regionContains } from '../src/lib/regions.ts'
import { regionLabelAnchor, regionColors } from '../src/lib/regionAtlasLabels.ts'
import { placeAtlasLabels } from '../src/lib/atlasLabelLayout.ts'
import { clusterRegionPoints } from '../src/lib/regionMapClusters.ts'

test('labels point inside the actual administrative land mass, including island provinces', () => {
  for (const region of [...provinces, ...districtsIn('11')]) {
    const [longitude, latitude] = regionLabelAnchor(region)
    assert.ok(regionContains(region, longitude, latitude), region.name)
  }
})

test('neighbouring central Seoul districts have distinguishable colors', () => {
  const regions = districtsIn('11'), colors = regionColors(regions)
  assert.ok(new Set(colors).size >= 4)
  assert.notEqual(colors[regions.findIndex(r => r.code === '11110')], colors[regions.findIndex(r => r.code === '11140')])
})

test('crowded mobile names stay inside the map and use non-overlapping callouts', () => {
  const labels = placeAtlasLabels(Array.from({ length: 25 }, (_, n) => ({ code: String(n), x: 160 + n % 5 * 14, y: 210 + Math.floor(n / 5) * 14, width: 64 })), 366, 570)
  assert.equal(labels.length, 25)
  assert.ok(labels.some(label => label.callout))
  for (let i = 0; i < labels.length; i++) {
    const a = labels[i]
    assert.ok(a.left >= 0 && a.left + a.width <= 366 && a.top >= 0 && a.top + a.height <= 570)
    for (const b of labels.slice(i + 1)) assert.ok(a.left + a.width <= b.left || b.left + b.width <= a.left || a.top + a.height <= b.top || b.top + b.height <= a.top)
  }
})

test('clusters count underlying facilities, keep membership and exclude off-screen points', () => {
  const points = [{ latitude: 20, longitude: 20, count: 3 }, { latitude: 40, longitude: 40, count: 1 }, { latitude: 180, longitude: 180, count: 2 }, { latitude: 900, longitude: 900, count: 5 }]
  const project = p => ({ x: p.longitude, y: p.latitude })
  const clusters = clusterRegionPoints(points, project, 300, 400, 76)
  assert.equal(clusters.length, 2)
  assert.equal(clusters[0].count, 4)
  assert.equal(clusters[0].latitude, 25)
  assert.deepEqual(clusters[0].items, points.slice(0, 2))
  const expanded = clusterRegionPoints(points, project, 300, 400, 0)
  assert.equal(expanded.length, 3)
  assert.equal(expanded.reduce((sum, group) => sum + group.count, 0), 6)
})
