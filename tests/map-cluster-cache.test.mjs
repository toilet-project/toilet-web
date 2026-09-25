import assert from 'node:assert/strict'
import test from 'node:test'
import { gunzipSync, gzipSync } from 'node:zlib'
import { buildClusterBins, clusterBinsInBounds, mapClusterGridFactor, mapClusterZoomSupported,
  sanitizeClusterPoints, validClusterBounds, validClusterBins } from '../src/lib/mapClusters.ts'
import { fetchClusterSourceOrigin, invalidateMapClusterCache, mapClusterObjectKey,
  readThroughMapClusterCache } from '../src/server/mapClusterCache.ts'

let bucketId = 0
class FakeR2 {
  objects = new Map(); sequence = 0; id = ++bucketId; getCalls = 0; headCalls = 0
  async get(key) {
    this.getCalls++
    const found = this.objects.get(key)
    return found ? { etag: found.etag,
      arrayBuffer: async () => found.value.buffer.slice(found.value.byteOffset,
        found.value.byteOffset + found.value.byteLength) } : null
  }
  async head(key) {
    this.headCalls++
    const found = this.objects.get(key)
    return found ? { etag: found.etag } : null
  }
  async put(key, value, options = {}) {
    const current = this.objects.get(key), only = options.onlyIf
    if (only?.etagDoesNotMatch === '*' && current) return null
    if (only?.etagMatches && current?.etag !== only.etagMatches) return null
    const etag = `bucket-${this.id}-etag-${++this.sequence}`
    this.objects.set(key, { etag, value: typeof value === 'string' ? gzipSync(value) : value })
    return { etag }
  }
  value(key) { return JSON.parse(gunzipSync(this.objects.get(key).value).toString()) }
}

const bounds = { south: 37.5, north: 37.6, west: 126.9, east: 127.1 }
const points = [[37.51, 127.01], [37.519, 127.019], [37.56, 127.06], [37.61, 127.05]]
const bins = buildClusterBins(points)

test('edge clusters reproduce the API grid sizes and clip the viewport before counting', () => {
  assert.deepEqual([10, 11, 12, 13, 14].map(mapClusterGridFactor), [100, 50, 20, 10, 5])
  assert.equal(mapClusterZoomSupported(9), false)
  assert.equal(mapClusterZoomSupported(10), true)
  const level10 = clusterBinsInBounds(bins, bounds, 10)
  assert.equal(level10.meta.total_count, 3)
  assert.equal(level10.meta.result_count, 2)
  const level12 = clusterBinsInBounds(bins, bounds, 12)
  assert.equal(level12.meta.display_type, 'CLUSTER')
  assert.equal(level12.meta.total_count, 3)
  assert.deepEqual(level12.clusters.map(cluster => cluster.count), [2, 1])
  assert.equal(level12.clusters[0].latitude, (37.51 + 37.519) / 2)
  assert.equal(level12.clusters[0].longitude, (127.01 + 127.019) / 2)
  assert.deepEqual(level12.toilets, [])
})

test('exact inclusive boundaries and outside-Korea map bounds preserve the API result', () => {
  const input = [[37.5, 127], [37.6, 127.1], [37.600001, 127]]
  const result = clusterBinsInBounds(buildClusterBins(input), bounds, 10)
  assert.equal(result.meta.total_count, 2)
  assert.equal(validClusterBounds({ south: 30, north: 45, west: 120, east: 140 }), true)
  assert.equal(clusterBinsInBounds(buildClusterBins(input), { south: -90, north: 90, west: -180, east: 180 }, 14).meta.total_count, 3)
})

test('materialized bins match a direct viewport scan at every cluster level', () => {
  const fixture = Array.from({ length: 1200 }, (_, index) => [
    36.5 + (index * 197 % 211) / 1000,
    126.7 + (index * 163 % 239) / 1000,
  ])
  const stored = buildClusterBins(fixture)
  for (const zoom of [10, 11, 12, 13, 14]) {
    const factor = mapClusterGridFactor(zoom)
    for (let window = 0; window < 12; window++) {
      const south = 36.5 + window / 100, west = 126.7 + window / 100
      const viewport = { south, north: south + 0.067, west, east: west + 0.079 }
      const expected = new Map()
      for (const [latitude, longitude] of fixture) {
        if (latitude < viewport.south || latitude > viewport.north
          || longitude < viewport.west || longitude > viewport.east) continue
        const key = `${Math.floor(latitude * factor + 1e-9)}:${Math.floor(longitude * factor + 1e-9)}`
        const group = expected.get(key) ?? { count: 0, latitude: 0, longitude: 0 }
        group.count++; group.latitude += latitude; group.longitude += longitude
        expected.set(key, group)
      }
      const actual = clusterBinsInBounds(stored, viewport, zoom)
      assert.equal(actual.meta.total_count, [...expected.values()].reduce((sum, group) => sum + group.count, 0))
      assert.equal(actual.meta.result_count, expected.size, `zoom=${zoom}, window=${window}`)
      for (const cluster of actual.clusters) {
        const key = `${Math.floor(cluster.latitude * factor + 1e-9)}:${Math.floor(cluster.longitude * factor + 1e-9)}`
        const group = expected.get(key)
        assert.ok(group, `missing ${key}`)
        assert.equal(cluster.count, group.count)
        assert.ok(Math.abs(cluster.latitude - group.latitude / group.count) < 1e-8)
        assert.ok(Math.abs(cluster.longitude - group.longitude / group.count) < 1e-8)
      }
    }
  }
})

test('cluster source rejects empty, malformed and non-Korean coordinates', () => {
  assert.throws(() => sanitizeClusterPoints([]), /size/)
  assert.throws(() => sanitizeClusterPoints([[37.5, 127, 1]]), /point/)
  assert.throws(() => sanitizeClusterPoints([[35.68, 139.69]]), /point/)
  assert.throws(() => clusterBinsInBounds(bins, { ...bounds, south: 38 }, 10), /viewport/)
  assert.equal(validClusterBins(bins), true)
  assert.equal(validClusterBins([{ ...bins[0], count: 9 }]), false)
})

test('concurrent readers share one national R2 snapshot and never read origin on hits', async () => {
  const bucket = new FakeR2(); let originReads = 0
  const fetchOrigin = async () => { originReads++; await new Promise(resolve => setTimeout(resolve, 20)); return points }
  const results = await Promise.all(Array.from({ length: 12 }, () =>
    readThroughMapClusterCache({ bucket, fetchOrigin })))
  assert.equal(originReads, 1)
  assert.equal(results.filter(result => result.source === 'miss').length, 1)
  assert.ok(results.every(result => result.bins.length === bins.length))
  const readsAfterWarm = bucket.getCalls
  assert.equal((await readThroughMapClusterCache({ bucket, fetchOrigin })).source, 'hit')
  assert.equal(originReads, 1)
  assert.equal(bucket.value(mapClusterObjectKey()).state, 'data')
  assert.equal(bucket.getCalls, readsAfterWarm)
  assert.equal(bucket.headCalls, 0)
  assert.ok(bucket.objects.get(mapClusterObjectKey()).value.byteLength < 300)
})

test('a change written by another isolate invalidates the decoded hot snapshot', async () => {
  const bucket = new FakeR2()
  await readThroughMapClusterCache({ bucket, fetchOrigin: async () => points })
  assert.equal((await readThroughMapClusterCache({ bucket })).source, 'hit')
  const before = bucket.getCalls
  const record = bucket.value(mapClusterObjectKey())
  await bucket.put(mapClusterObjectKey(), JSON.stringify({ ...record, state: 'invalidated', data: undefined }))
  const originalNow = Date.now
  Date.now = () => originalNow() + 31_000
  let rebuilt
  try {
    rebuilt = await readThroughMapClusterCache({ bucket, fetchOrigin: async () => [[37.52, 127.02]] })
  } finally { Date.now = originalNow }
  assert.equal(rebuilt.source, 'miss')
  assert.ok(bucket.getCalls > before)
  assert.equal(clusterBinsInBounds(rebuilt.bins, bounds, 10).meta.total_count, 1)
})

test('invalidation forces a new source and defeats an in-flight stale writer', async () => {
  const bucket = new FakeR2(); let reads = 0
  const first = await readThroughMapClusterCache({ bucket, fetchOrigin: async () => points })
  assert.equal(first.bins.length, bins.length)
  await invalidateMapClusterCache(bucket)
  assert.equal(bucket.value(mapClusterObjectKey()).state, 'invalidated')
  const result = await readThroughMapClusterCache({ bucket, fetchOrigin: async () => {
    reads++
    if (reads === 1) {
      await invalidateMapClusterCache(bucket)
      return [[37.51, 127.01]]
    }
    return [[37.52, 127.02], [37.53, 127.03]]
  } })
  assert.equal(reads, 2)
  assert.equal(result.bins.length, 2)
})

test('an origin failure serves a bounded stale snapshot without retrying on every pan', async () => {
  const bucket = new FakeR2()
  let clock = 1_000_000
  let reads = 0
  const now = () => clock
  await readThroughMapClusterCache({ bucket, now, fetchOrigin: async () => points })
  clock += 31 * 24 * 60 * 60 * 1000
  const fetchOrigin = async () => { reads++; throw new Error('origin unavailable') }
  assert.equal((await readThroughMapClusterCache({ bucket, now, fetchOrigin })).source, 'stale')
  assert.equal((await readThroughMapClusterCache({ bucket, now, fetchOrigin })).source, 'stale')
  assert.equal(reads, 1)
  clock += 60_001
  assert.equal((await readThroughMapClusterCache({ bucket, now, fetchOrigin })).source, 'stale')
  assert.equal(reads, 2)
  await invalidateMapClusterCache(bucket, now)
  await assert.rejects(readThroughMapClusterCache({ bucket, now, fetchOrigin }), /origin unavailable/)
})

test('preview alone can derive a compact snapshot from the existing full marker API', async () => {
  const originalFetch = globalThis.fetch
  const originalSecret = process.env.CACHE_REVALIDATION_SECRET
  const originalFallback = process.env.MAP_CLUSTER_LEGACY_SOURCE_FALLBACK
  const calls = []
  process.env.CACHE_REVALIDATION_SECRET = 'test-preview-signature-secret-at-least-32-bytes'
  process.env.MAP_CLUSTER_LEGACY_SOURCE_FALLBACK = 'true'
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options })
    return calls.length === 1 ? { status: 401, ok: false }
      : { status: 200, ok: true, json: async () => ({ meta: { display_type: 'MARKER', total_count: 2 },
        toilets: [{ latitude: 37.52, longitude: 127.02, name: 'not cached' },
          { latitude: 37.53, longitude: 127.03, phoneNumber: 'not cached' }] }) }
  }
  try {
    assert.deepEqual(await fetchClusterSourceOrigin(), [[37.52, 127.02], [37.53, 127.03]])
    assert.match(calls[0].url, /\/map-cluster-points$/)
    assert.match(calls[0].options.headers['X-Map-Cluster-Signature'], /^[a-f0-9]{64}$/)
    assert.match(calls[1].url, /includeList=true/)
    process.env.MAP_CLUSTER_LEGACY_SOURCE_FALLBACK = 'false'
    calls.length = 0
    await assert.rejects(fetchClusterSourceOrigin(), /HTTP 401/)
    assert.equal(calls.length, 1)
  } finally {
    globalThis.fetch = originalFetch
    if (originalSecret === undefined) delete process.env.CACHE_REVALIDATION_SECRET
    else process.env.CACHE_REVALIDATION_SECRET = originalSecret
    if (originalFallback === undefined) delete process.env.MAP_CLUSTER_LEGACY_SOURCE_FALLBACK
    else process.env.MAP_CLUSTER_LEGACY_SOURCE_FALLBACK = originalFallback
  }
})
