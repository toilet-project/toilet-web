import assert from 'node:assert/strict'
import test from 'node:test'
import { createMapViewportClient, MAP_VIEWPORT_SOURCE_TTL_MS } from '../src/lib/mapViewportSourceCache.ts'
import { cellsForBounds } from '../src/lib/mapCells.ts'

const params = { southLat: 36.351, northLat: 36.399, westLng: 127.301, eastLng: 127.349,
  zoom: 4, includeList: true, filterFlags: 0 }
const marker = (id = 1, flags = 17) => ({ id, name: `공중 화장실 ${id}`, latitude: 36.36,
  longitude: 127.32, filterFlags: flags, filterSchema: 3 })
const response = toilets => ({ meta: { display_type: 'MARKER', map_level: 4,
  total_count: toilets.length, result_count: toilets.length }, toilets, clusters: [] })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const payload = (cells, markers = [marker()]) => ({ schema: 3, cells: cells.map(cell => ({ cell,
  toilets: markers.filter(item => item.latitude >= cell.y / 20 && item.latitude <= (cell.y + 1) / 20
    && item.longitude >= cell.x / 20 && item.longitude <= (cell.x + 1) / 20) })) })
const tick = async () => { await Promise.resolve(); await Promise.resolve() }

test('a complete unfiltered viewport immediately supports multiple filters, subsets, and current personal selections', async () => {
  let legacy = 0, sources = 0
  const client = createMapViewportClient({ fetchFallback: async () => { legacy++; return response([marker(1, 17), marker(2, 2)]) },
    fetchCells: async cells => { sources++; return payload(cells) } })
  await client.fetch(params)
  assert.deepEqual((await client.fetch({ ...params, filterFlags: 16 })).toilets.map(item => item.id), [1])
  assert.deepEqual((await client.fetch({ ...params, filterFlags: 2 })).toilets.map(item => item.id), [2])
  assert.deepEqual((await client.fetch({ ...params, likedIds: [1] })).toilets.map(item => item.id), [1])
  assert.deepEqual((await client.fetch({ ...params, likedIds: [2] })).toilets.map(item => item.id), [2])
  assert.deepEqual((await client.fetch({ ...params, southLat: 36.37, likedIds: [1] })).toilets, [])
  assert.equal(legacy, 1)
  assert.equal(sources, 0)
})

test('partial, truncated, out-of-view, and unknown-attribute results never establish complete viewport coverage', async () => {
  const cases = [response([{ ...marker(), filterFlags: undefined }]), response([{ ...marker(), filterSchema: 2 }]),
    { ...response([marker()]), meta: { ...response([]).meta, total_count: 2, result_count: 1 } },
    response([{ ...marker(), latitude: 36.42 }])]
  for (const initial of cases) {
    let calls = 0
    const client = createMapViewportClient({ fetchFallback: async () => initial,
      fetchCells: async cells => { calls++; return payload(cells, [marker(9, 16)]) } })
    await client.fetch(params)
    assert.deepEqual((await client.fetch({ ...params, filterFlags: 16 })).toilets.map(item => item.id), [9])
    assert.equal(calls, 1)
  }
})

test('first filtered lookup obtains full cells, then filtering and panning request only missing public cells', async () => {
  const calls = []
  const all = [marker(1, 16), marker(2, 2), { ...marker(3, 16), longitude: 127.37 }, { ...marker(4, 16), longitude: 127.39 }]
  const client = createMapViewportClient({ fetchFallback: async () => { throw new Error('unexpected fallback') },
    fetchCells: async cells => { calls.push(cells); return payload(cells, all) } })
  assert.deepEqual((await client.fetch({ ...params, filterFlags: 16 })).toilets.map(item => item.id), [1])
  assert.deepEqual((await client.fetch({ ...params, filterFlags: 2 })).toilets.map(item => item.id), [2])
  assert.deepEqual((await client.fetch({ ...params, eastLng: 127.38 })).toilets.map(item => item.id), [1, 2, 3])
  assert.equal(calls.length, 2)
  assert.deepEqual(calls.map(cells => cells.length), [1, 1])
  assert.notEqual(calls[0][0].x, calls[1][0].x)
  assert.deepEqual((await client.fetch({ ...params, eastLng: 127.38, filterFlags: 16 })).toilets.map(item => item.id), [1, 3])
  assert.equal(calls.length, 2)
})

test('overlapping concurrent requests share pending cells while individual abort does not cancel other consumers', async () => {
  const first = deferred(), second = deferred()
  const calls = []
  const client = createMapViewportClient({ fetchFallback: async () => response([]), fetchCells: (cells, signal) => {
    calls.push({ cells, signal }); return calls.length === 1 ? first.promise : second.promise
  } })
  const controller = new AbortController()
  const cancelled = client.fetch({ ...params, filterFlags: 16 }, controller.signal)
  const other = client.fetch({ ...params, eastLng: 127.38, filterFlags: 2 })
  await tick()
  assert.deepEqual(calls.map(call => call.cells.length), [1, 1])
  controller.abort()
  await assert.rejects(cancelled, { name: 'AbortError' })
  assert.equal(calls[0].signal.aborted, false)
  first.resolve(payload(calls[0].cells, [marker(1, 2)]))
  second.resolve(payload(calls[1].cells, [{ ...marker(2, 2), longitude: 127.37 }]))
  assert.deepEqual((await other).toilets.map(item => item.id), [1, 2])
  assert.equal(calls.length, 2)
})

test('freshness expires after 15 seconds and clear prevents late completion from reviving old public data', async () => {
  let clock = 0
  let calls = 0
  const old = deferred()
  const client = createMapViewportClient({ now: () => clock, fetchFallback: async () => response([]),
    fetchCells: async cells => { calls++; return calls === 3 ? old.promise : payload(cells, [marker(calls, 16)]) } })
  await client.fetch({ ...params, filterFlags: 16 })
  clock = MAP_VIEWPORT_SOURCE_TTL_MS - 1
  assert.deepEqual((await client.fetch({ ...params, filterFlags: 16 })).toilets.map(item => item.id), [1])
  clock++
  assert.deepEqual((await client.fetch({ ...params, filterFlags: 16 })).toilets.map(item => item.id), [2])
  client.clear()
  const stale = client.fetch({ ...params, filterFlags: 16 })
  await tick()
  client.clear()
  const fresh = client.fetch({ ...params, filterFlags: 16 })
  const requested = cellsForBounds({ south: params.southLat, north: params.northLat, west: params.westLng, east: params.eastLng })
  old.resolve(payload(requested, [marker(99, 16)]))
  await assert.rejects(stale, { name: 'AbortError' })
  assert.deepEqual((await fresh).toilets.map(item => item.id), [4])
  assert.deepEqual((await client.fetch({ ...params, filterFlags: 16 })).toilets.map(item => item.id), [4])
})

test('a cell that expires during a neighboring download is refreshed before the combined result is shown', async () => {
  let clock = 0
  const missing = deferred()
  const calls = []
  const client = createMapViewportClient({ now: () => clock, fetchFallback: async () => { throw new Error('unexpected fallback') },
    fetchCells: async cells => {
      calls.push(cells)
      if (calls.length === 2) return missing.promise
      return payload(cells, [marker(calls.length, 16)])
    } })
  await client.fetch({ ...params, filterFlags: 16 })
  clock = MAP_VIEWPORT_SOURCE_TTL_MS - 1
  const moved = client.fetch({ ...params, eastLng: 127.38, filterFlags: 16 })
  await tick()
  clock += 2
  missing.resolve(payload(calls[1], [{ ...marker(2, 16), longitude: 127.37 }]))
  assert.deepEqual((await moved).toilets.map(item => item.id), [2, 3])
  assert.equal(calls.length, 3)
  assert.deepEqual(calls[2], calls[0])
})

test('clear cancels shared public requests, remains reusable, and dispose permanently rejects new requests', async () => {
  let calls = 0, sourceSignal
  const pending = deferred()
  const client = createMapViewportClient({ fetchFallback: async () => response([]), fetchCells: (cells, signal) => {
    calls++; sourceSignal = signal; return calls === 1 ? pending.promise : Promise.resolve(payload(cells))
  } })
  const first = client.fetch({ ...params, filterFlags: 16 })
  await tick()
  client.clear()
  assert.equal(sourceSignal.aborted, true)
  pending.resolve(payload([{ x: 2546, y: 727 }]))
  await assert.rejects(first, { name: 'AbortError' })
  assert.equal((await client.fetch({ ...params, filterFlags: 16 })).toilets.length, 1)
  client.dispose()
  await assert.rejects(client.fetch(params), { name: 'AbortError' })
})

test('abandoned map movements cancel source transport, and their late responses cannot seed the next lookup', async () => {
  const abandoned = deferred()
  const calls = []
  const client = createMapViewportClient({ fetchFallback: async () => response([]), fetchCells: (cells, signal) => {
    calls.push({ cells, signal }); return calls.length === 1 ? abandoned.promise : Promise.resolve(payload(cells, [marker(2)]))
  } })
  const controller = new AbortController()
  const first = client.fetch({ ...params, filterFlags: 16 }, controller.signal)
  await tick()
  controller.abort()
  await assert.rejects(first, { name: 'AbortError' })
  await tick()
  assert.equal(calls[0].signal.aborted, true)
  const second = await client.fetch({ ...params, filterFlags: 16 })
  assert.deepEqual(second.toilets.map(item => item.id), [2])
  abandoned.resolve(payload(calls[0].cells, [marker(99)]))
  await tick()
  assert.deepEqual((await client.fetch({ ...params, filterFlags: 16 })).toilets.map(item => item.id), [2])
  assert.equal(calls.length, 2)
})

test('a replacement filter in the same turn joins the public request before it is abandoned', async () => {
  const pending = deferred()
  const calls = []
  const client = createMapViewportClient({ fetchFallback: async () => response([]), fetchCells: (cells, signal) => {
    calls.push({ cells, signal }); return pending.promise
  } })
  const controller = new AbortController()
  const first = client.fetch({ ...params, filterFlags: 16 }, controller.signal)
  await tick()
  controller.abort()
  const replacement = client.fetch({ ...params, filterFlags: 2 })
  await assert.rejects(first, { name: 'AbortError' })
  await tick()
  assert.equal(calls[0].signal.aborted, false)
  pending.resolve(payload(calls[0].cells, [marker(1, 2)]))
  assert.deepEqual((await replacement).toilets.map(item => item.id), [1])
  assert.equal(calls.length, 1)
})

test('ordinary first viewport requests are shared but abandoned public fallbacks are also cancelled', async () => {
  const pending = deferred()
  const calls = []
  const client = createMapViewportClient({ fetchFallback: (input, signal) => {
    calls.push({ input, signal }); return pending.promise
  }, fetchCells: async cells => payload(cells) })
  const a = new AbortController(), b = new AbortController()
  const first = client.fetch(params, a.signal)
  const second = client.fetch(params, b.signal)
  await tick()
  assert.equal(calls.length, 1)
  a.abort()
  await assert.rejects(first, { name: 'AbortError' })
  assert.equal(calls[0].signal.aborted, false)
  b.abort()
  await assert.rejects(second, { name: 'AbortError' })
  await tick()
  assert.equal(calls[0].signal.aborted, true)
  pending.resolve(response([marker(99)]))
  await tick()
  // A late legacy response cannot become a complete snapshot after both consumers left.
  assert.deepEqual((await client.fetch({ ...params, filterFlags: 16 })).toilets.map(item => item.id), [1])
})

test('malformed or incomplete source batches fail without falling back to unfiltered or caching partial data', async () => {
  const invalid = [cells => ({ schema: 3, cells: [] }), cells => ({ schema: 3, cells: [
    { cell: cells[0], toilets: [marker()] }, { cell: cells[0], toilets: [marker()] }] }),
    cells => payload(cells, [{ ...marker(), filterFlags: 128 }]),
    cells => ({ schema: 3, cells: [{ cell: cells[0], toilets: [{ ...marker(), latitude: 37 }] }] })]
  for (const makeInvalid of invalid) {
    let calls = 0
    const client = createMapViewportClient({ fetchFallback: async () => { throw new Error('unsafe fallback') },
      fetchCells: async cells => { calls++; return calls === 1 ? makeInvalid(cells) : payload(cells) } })
    await assert.rejects(client.fetch({ ...params, filterFlags: 16 }), /map source/i)
    assert.equal((await client.fetch({ ...params, filterFlags: 16 })).toilets.length, 1)
    assert.equal(calls, 2)
  }
})

test('personal IDs never enter the source request, and personal results are recomputed per call', async () => {
  const sent = []
  const client = createMapViewportClient({ fetchFallback: async () => { throw new Error('unexpected fallback') },
    fetchCells: async (...args) => { sent.push(args); return payload(args[0], [marker(1), marker(2)]) } })
  assert.deepEqual((await client.fetch({ ...params, likedIds: [1] })).toilets.map(item => item.id), [1])
  assert.deepEqual((await client.fetch({ ...params, likedIds: [2] })).toilets.map(item => item.id), [2])
  assert.deepEqual((await client.fetch({ ...params, likedIds: [] })).toilets, [])
  assert.equal(sent.length, 1)
  assert.deepEqual(Object.keys(sent[0][0][0]).sort(), ['x', 'y'])
  assert.equal(JSON.stringify(sent[0][0]).includes('liked'), false)
})

test('wide and overview queries keep the original server aggregation behavior', async () => {
  const seen = []
  const client = createMapViewportClient({ fetchFallback: async input => { seen.push(input); return response([]) },
    fetchCells: async () => { throw new Error('unbounded cells') } })
  await client.fetch({ ...params, zoom: 10, filterFlags: 16, includeList: false })
  await client.fetch({ ...params, northLat: 39, filterFlags: 16 })
  assert.equal(seen.length, 2)
  assert.equal(seen[0].zoom, 10)
})

test('mutating a displayed response cannot modify the public source used by the next filter', async () => {
  const publicMarker = { ...marker(), secret: 'private field', translations: { en: { name: 'Public Toilet',
    roadAddress: 'not part of marker contract', jibunAddress: null, secret: 'private nested field' }, 'invalid locale': { name: 'bad' } },
    displayGroupTranslations: { en: 'Public group', 'invalid locale': 'bad' } }
  const client = createMapViewportClient({ fetchFallback: async () => response([publicMarker]), fetchCells: async cells => payload(cells) })
  const initial = await client.fetch(params)
  initial.toilets[0].filterFlags = 0
  const selected = await client.fetch({ ...params, filterFlags: 16 })
  assert.deepEqual(selected.toilets[0].translations, { en: { name: 'Public Toilet', roadAddress: null, jibunAddress: null } })
  assert.deepEqual(selected.toilets[0].displayGroupTranslations, { en: 'Public group' })
  assert.equal(Object.hasOwn(selected.toilets[0], 'secret'), false)
  selected.toilets[0].translations.en.name = 'mutated'
  selected.toilets[0].filterFlags = 0
  assert.equal((await client.fetch({ ...params, filterFlags: 16 })).toilets.length, 1)
  assert.equal((await client.fetch({ ...params, filterFlags: 16 })).toilets[0].translations.en.name, 'Public Toilet')
})

test('cell memory is bounded while recently used regions remain reusable', async () => {
  let calls = 0
  const client = createMapViewportClient({ fetchFallback: async () => response([]),
    fetchCells: async cells => { calls++; return payload(cells, []) } })
  const at = offset => ({ ...params, westLng: 124.001 + offset * 0.05, eastLng: 124.049 + offset * 0.05, filterFlags: 16 })
  for (let index = 0; index < 65; index++) await client.fetch(at(index))
  assert.equal(calls, 65)
  await client.fetch(at(64))
  assert.equal(calls, 65)
  await client.fetch(at(0))
  assert.equal(calls, 66)
})
