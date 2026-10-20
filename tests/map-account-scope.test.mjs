import assert from 'node:assert/strict'
import test from 'node:test'
import { createMapAccountScope } from '../src/lib/mapAccountScope.ts'
import { createMapViewportClient } from '../src/lib/mapViewportSourceCache.ts'

const pendingSession = { owner: null, authLoading: true }
const confirmed = (owner, publicSelection = true) => ({ owner, authLoading: false, publicSelection })
const params = { southLat: 36.351, northLat: 36.399, westLng: 127.301, eastLng: 127.349,
  zoom: 4, includeList: true, filterFlags: 0 }
const marker = id => ({ id, name: `공중 화장실 ${id}`, latitude: 36.36,
  longitude: 127.32, filterFlags: 17, filterSchema: 3 })
const response = toilets => ({ meta: { display_type: 'MARKER', map_level: 4,
  total_count: toilets.length, result_count: toilets.length }, toilets, clusters: [] })
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

test('only the first authenticated session resolution preserves an existing public map read', () => {
  const scope = createMapAccountScope(pendingSession)
  assert.equal(scope.update({ ...pendingSession, publicSelection: true }), 'unchanged')
  assert.equal(scope.update(confirmed('owner-a')), 'preserve-initial-public')
  assert.equal(scope.update(confirmed('owner-a')), 'unchanged')
  assert.equal(scope.update(confirmed('owner-b')), 'reset')
  assert.equal(scope.update(confirmed(null)), 'reset')
  assert.equal(scope.update(confirmed('owner-a')), 'reset')
})

test('a first anonymous or restricted session resolution consumes the exception before a later login or consent change', () => {
  for (const publicSelection of [true, false]) {
    const scope = createMapAccountScope(pendingSession)
    assert.equal(scope.update(confirmed(null, publicSelection)), 'unchanged')
    assert.equal(scope.update(confirmed('owner-a', publicSelection)), 'reset')
  }
})

test('private, blocked, or not-yet-ready selections must retain the first account reset', () => {
  const scope = createMapAccountScope(pendingSession)
  assert.equal(scope.update(confirmed('owner-a', false)), 'reset')
  assert.equal(scope.update(confirmed('owner-a', true)), 'unchanged')
  assert.equal(scope.update(confirmed('owner-b', true)), 'reset')
})

test('session rechecking, logout, and account switching never re-enable the initial public exception', () => {
  const scope = createMapAccountScope({ owner: 'owner-a', authLoading: false })
  assert.equal(scope.update({ ...pendingSession, publicSelection: true }), 'reset')
  assert.equal(scope.update(confirmed('owner-a')), 'reset')
  assert.equal(scope.update(confirmed(null)), 'reset')
  assert.equal(scope.update(confirmed('owner-b')), 'reset')
})

test('initial public session confirmation reuses the pending transport and its complete public source', async () => {
  const scope = createMapAccountScope(pendingSession)
  const pending = deferred()
  let calls = 0, transportSignal
  const client = createMapViewportClient({ fetchFallback: async (_, signal) => {
    calls++; transportSignal = signal; return pending.promise
  }, fetchCells: async () => { throw new Error('unexpected source download') } })
  const inProgress = client.fetch(params)
  await Promise.resolve()
  const action = scope.update(confirmed('owner-a'))
  assert.equal(action, 'preserve-initial-public')
  assert.equal(transportSignal.aborted, false)
  pending.resolve(response([marker(1), marker(2)]))
  assert.deepEqual((await inProgress).toilets.map(item => item.id), [1, 2])
  assert.deepEqual((await client.fetch({ ...params, filterFlags: 16 })).toilets.map(item => item.id), [1, 2])
  assert.deepEqual((await client.fetch({ ...params, likedIds: [2] })).toilets.map(item => item.id), [2])
  assert.equal(calls, 1)
})

test('an actual account transition invalidates an old personal lookup before the next account can reuse the public cell', async () => {
  const scope = createMapAccountScope({ owner: 'owner-a', authLoading: false })
  const pending = deferred()
  let sourceCalls = 0
  const sourceSignals = []
  const client = createMapViewportClient({ fetchFallback: async () => { throw new Error('unexpected fallback') },
    fetchCells: async (cells, signal) => {
      sourceCalls++; sourceSignals.push(signal)
      if (sourceCalls === 1) return pending.promise
      return { schema: 3, cells: cells.map(cell => ({ cell, toilets: [marker(1), marker(2)] })) }
    } })
  const formerOwner = client.fetch({ ...params, likedIds: [1] })
  await Promise.resolve()
  assert.equal(scope.update(confirmed('owner-b')), 'reset')
  client.clear()
  const nextOwner = client.fetch({ ...params, likedIds: [2] })
  assert.equal(sourceSignals[0].aborted, true)
  pending.resolve({ schema: 3, cells: [{ cell: { x: 2546, y: 727 }, toilets: [marker(1)] }] })
  await assert.rejects(formerOwner, { name: 'AbortError' })
  assert.deepEqual((await nextOwner).toilets.map(item => item.id), [2])
  assert.deepEqual((await client.fetch({ ...params, likedIds: [] })).toilets, [])
  assert.equal(sourceCalls, 2)
})
