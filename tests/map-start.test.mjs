import assert from 'node:assert/strict'
import test from 'node:test'
import { initialMapLocation, isKoreanMapLocation, SEOUL_STATION } from '../src/lib/mapStart.ts'

test('fresh map and unavailable or overseas GPS start at Seoul Station', () => {
  assert.deepEqual(initialMapLocation(null), { center: SEOUL_STATION, usedFallback: true })
  for (const point of [
    { latitude: 35.6895, longitude: 139.6917 }, // Tokyo
    { latitude: 33.5902, longitude: 130.4017 }, // Fukuoka: inside the broad map-cell bounds
    { latitude: Number.NaN, longitude: 126.97 },
  ]) {
    assert.equal(isKoreanMapLocation(point), false)
    assert.deepEqual(initialMapLocation(point), { center: SEOUL_STATION, usedFallback: true })
  }
})

test('domestic GPS and saved map centers remain in their chosen location', () => {
  for (const point of [
    SEOUL_STATION,
    { latitude: 36.3504, longitude: 127.3845 }, // Daejeon
    { latitude: 35.1796, longitude: 129.0756 }, // Busan
    { latitude: 33.4996, longitude: 126.5312 }, // Jeju
  ]) {
    assert.equal(isKoreanMapLocation(point), true)
    assert.deepEqual(initialMapLocation(point), { center: point, usedFallback: false })
  }
})
