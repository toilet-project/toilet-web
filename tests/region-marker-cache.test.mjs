import assert from 'node:assert/strict'
import test from 'node:test'
import { invalidateRegionMarkers, readThroughRegionMarkers, readRegionMarkersOrFallback,
  RegionMarkerOriginError, regionMarkerFreshAge, regionMarkerGlobalKey,
  regionMarkerObjectKey } from '../src/server/regionMarkerCache.ts'

class FakeR2 {
  objects = new Map(); sequence = 0
  async get(key) {
    const found = this.objects.get(key)
    return found ? { etag: found.etag, json: async () => JSON.parse(found.value) } : null
  }
  async put(key, value, options = {}) {
    const current = this.objects.get(key), only = options.onlyIf
    if (only?.etagDoesNotMatch === '*' && current) return null
    if (only?.etagMatches && current?.etag !== only.etagMatches) return null
    const etag = `etag-${++this.sequence}`
    this.objects.set(key, { etag, value })
    return { etag }
  }
  value(key) { return JSON.parse(this.objects.get(key).value) }
}
const code = '11110'
const marker = name => ({ id: 1, name, latitude: 37.58, longitude: 126.98,
  translations: { en: { name: 'English', roadAddress: null, jibunAddress: null } } })

test('concurrent locale readers share one stable district object and origin fetch', async () => {
  const bucket = new FakeR2(); let reads = 0
  const fetchOrigin = async () => { reads++; await new Promise(resolve => setTimeout(resolve, 15)); return [marker('공통')] }
  const results = await Promise.all(Array.from({ length: 12 }, () =>
    readThroughRegionMarkers({ bucket, districtCode: code, fetchOrigin })))
  assert.equal(reads, 1)
  assert.ok(results.every(result => result.toilets[0].translations.en.name === 'English'))
  assert.equal(bucket.objects.size, 1)
  assert.equal(bucket.value(regionMarkerObjectKey(code)).state, 'data')
})

test('a scoped edit replaces only its affected district', async () => {
  const bucket = new FakeR2(); let name = 'before'; let reads = 0
  const fetchOrigin = async () => { reads++; return [marker(name)] }
  await readThroughRegionMarkers({ bucket, districtCode: code, fetchOrigin })
  await readThroughRegionMarkers({ bucket, districtCode: '11140', fetchOrigin })
  name = 'after'
  await invalidateRegionMarkers(bucket, [code])
  assert.equal(bucket.value(regionMarkerObjectKey(code)).state, 'invalidated')
  assert.equal((await readThroughRegionMarkers({ bucket, districtCode: code, fetchOrigin })).toilets[0].name, 'after')
  assert.equal((await readThroughRegionMarkers({ bucket, districtCode: '11140', fetchOrigin })).toilets[0].name, 'before')
  assert.equal(reads, 3)
})

test('an unknown edit scope changes the global generation', async () => {
  const bucket = new FakeR2(); let name = 'before'
  const fetchOrigin = async () => [marker(name)]
  await readThroughRegionMarkers({ bucket, districtCode: code, fetchOrigin })
  name = 'after'
  await invalidateRegionMarkers(bucket, null)
  assert.equal(bucket.value(regionMarkerGlobalKey()).revision, 1)
  assert.equal((await readThroughRegionMarkers({ bucket, districtCode: code, fetchOrigin })).toilets[0].name, 'after')
})

test('an edit racing with origin refresh never restores the old snapshot', async () => {
  const bucket = new FakeR2(); let reads = 0
  const result = await readThroughRegionMarkers({ bucket, districtCode: code, fetchOrigin: async () => {
    reads++
    if (reads === 1) { await invalidateRegionMarkers(bucket, [code]); return [marker('old')] }
    return [marker('new')]
  } })
  assert.equal(result.toilets[0].name, 'new')
  assert.equal(reads, 2)
})

test('an origin failure does not silently serve an invalidated snapshot', async () => {
  const bucket = new FakeR2()
  await readThroughRegionMarkers({ bucket, districtCode: code, fetchOrigin: async () => [marker('old')] })
  await invalidateRegionMarkers(bucket, [code])
  await assert.rejects(readThroughRegionMarkers({ bucket, districtCode: code,
    fetchOrigin: async () => { throw new Error('origin unavailable') } }), /origin unavailable/)
  assert.equal(bucket.value(regionMarkerObjectKey(code)).state, 'invalidated')
})

test('expiry is spread across seven days, with a short stale retry window', async () => {
  const bucket = new FakeR2(); let time = 1_000
  const now = () => time
  await readThroughRegionMarkers({ bucket, districtCode: code, now,
    fetchOrigin: async () => [marker('previous')] })
  assert.notEqual(regionMarkerFreshAge(code), regionMarkerFreshAge('11140'))
  time += regionMarkerFreshAge(code) + 1
  const stale = await readThroughRegionMarkers({ bucket, districtCode: code, now,
    fetchOrigin: async () => { throw new RegionMarkerOriginError('offline') } })
  assert.equal(stale.source, 'stale')
  assert.equal(stale.toilets[0].name, 'previous')
  const stillStale = await readThroughRegionMarkers({ bucket, districtCode: code, now,
    fetchOrigin: async () => { throw new Error('should not retry immediately') } })
  assert.equal(stillStale.source, 'stale')
  await invalidateRegionMarkers(bucket, [code], now)
  await assert.rejects(readThroughRegionMarkers({ bucket, districtCode: code, now,
    fetchOrigin: async () => { throw new RegionMarkerOriginError('offline') } }), /offline/)
})

test('R2 outage falls back to the tagged origin path but origin outage does not retry it', async () => {
  const bucket = { get: async () => { throw new Error('R2 unavailable') }, put: async () => null }
  const fallback = await readRegionMarkersOrFallback({ bucket, districtCode: code,
    fetchOrigin: async () => [marker('unused')] }, async () => [marker('API fallback')])
  assert.equal(fallback.source, 'fallback')
  assert.equal(fallback.toilets[0].name, 'API fallback')
  let fallbackReads = 0
  await assert.rejects(readRegionMarkersOrFallback({ bucket: new FakeR2(), districtCode: code,
    fetchOrigin: async () => { throw new RegionMarkerOriginError('origin offline') } },
  async () => { fallbackReads++; return [] }), /origin offline/)
  assert.equal(fallbackReads, 0)
})
