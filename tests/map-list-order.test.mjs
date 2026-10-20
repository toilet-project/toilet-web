import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateDistanceInMeters, orderMapListByDistance } from '../src/lib/mapListOrder.ts'

const reference = { latitude: 37.557863, longitude: 126.969468 }

// Keep the former comparator independent so numerical and ordering parity are checked.
function formerDistance(from, to) {
  const earthRadiusInMeters = 6_371_000
  const toRadians = degree => degree * (Math.PI / 180)
  const latitudeDelta = toRadians(to.latitude - from.latitude)
  const longitudeDelta = toRadians(to.longitude - from.longitude)
  const latitudeFrom = toRadians(from.latitude)
  const latitudeTo = toRadians(to.latitude)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeFrom) * Math.cos(latitudeTo) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * earthRadiusInMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

test('distance decoration preserves the former nearest-first order and displayed numeric distances', () => {
  const groups = Array.from({ length: 500 }, (_, id) => ({ id,
    latitude: 37.5 + ((id * 7919) % 10_000) / 100_000,
    longitude: 126.9 + ((id * 17389) % 10_000) / 100_000 }))
  const former = [...groups].sort((left, right) => formerDistance(reference, left) - formerDistance(reference, right))
  assert.deepEqual(orderMapListByDistance(groups, reference), former.map(group => ({ group,
    distanceInMeters: formerDistance(reference, group) })))
  assert.equal(calculateDistanceInMeters(reference, reference), 0)
})

test('equal-distance groups retain their source order and leave source objects untouched', () => {
  const groups = Object.freeze([
    Object.freeze({ id: 2, ...reference }),
    Object.freeze({ id: 1, ...reference }),
    Object.freeze({ id: 3, latitude: 36.36, longitude: 127.32 }),
  ])
  const original = structuredClone(groups)
  const fixedReference = Object.freeze({ ...reference })
  const ordered = orderMapListByDistance(groups, fixedReference)
  assert.deepEqual(ordered.map(entry => entry.group.id), [2, 1, 3])
  assert.deepEqual(groups, original)
  assert.equal(ordered[0].group, groups[0])
  assert.deepEqual(fixedReference, reference)
})

test('without a reference point the original order is kept and no distance is invented', () => {
  const groups = [{ id: 9, latitude: 36.36, longitude: 127.32 }, { id: 3, ...reference }]
  assert.deepEqual(orderMapListByDistance(groups, null), groups.map(group => ({ group, distanceInMeters: null })))
  assert.deepEqual(orderMapListByDistance([], reference), [])
})
