import assert from 'node:assert/strict'
import test from 'node:test'
import { initialMapLocation, isKoreanMapLocation, SEOUL_STATION } from '../src/lib/mapStart.ts'
import { isSouthKoreanCoordinate } from '../src/lib/koreaBoundary.ts'
import { provinces, regionContains } from '../src/lib/regions.ts'

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

test('the startup outline preserves the complete release boundary, including islands and offshore exclusions', () => {
  // A country bounding rectangle would also accept overseas and open sea.
  // Compare the extracted predicate against every released province polygon
  // across mainland, islands and the surrounding sea.
  for (let latitude = 32; latitude <= 39.5; latitude += 0.125) {
    for (let longitude = 124; longitude <= 132; longitude += 0.125) {
      assert.equal(isSouthKoreanCoordinate(longitude, latitude),
        provinces.some(province => regionContains(province, longitude, latitude)), `${longitude}, ${latitude}`)
    }
  }
  for (const invalid of [Number.NaN, Infinity, -Infinity]) {
    assert.equal(isSouthKoreanCoordinate(invalid, 37.5), false)
    assert.equal(isSouthKoreanCoordinate(127, invalid), false)
  }
})
