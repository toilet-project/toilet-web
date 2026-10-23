import assert from 'node:assert/strict'
import test from 'node:test'
import { createMapRequestCoalescer } from '../src/lib/mapRequestCoalescer.ts'

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

test('initial idle and resize share pending work, while a completed request is never cached', async () => {
  const requests = createMapRequestCoalescer(), pending = deferred(), scope = {}, map = {}
  let calls = 0
  const operation = async () => { calls++; await pending.promise }
  const first = requests.run([map, scope, 37, 38, 127, 128, 6, true], operation)
  await Promise.resolve()
  const idle = requests.run([map, scope, 37, 38, 127, 128, 6, true], operation)
  assert.equal(first, idle)
  assert.equal(calls, 1)
  pending.resolve(); await first
  await requests.run([map, scope, 37, 38, 127, 128, 6, true], operation)
  assert.equal(calls, 2)
})

test('changed bounds, zoom, list mode, SDK or private filter scope abort superseded work', async () => {
  const map = {}, scope = {}, original = [map, scope, 37, 38, 127, 128, 6, true]
  for (const [index, replacement] of [[0, {}], [1, {}], [2, 37.00000001], [3, 39], [4, 126], [5, 129], [6, 7], [7, false]]) {
    const requests = createMapRequestCoalescer(), old = deferred(), latest = deferred()
    let firstSignal, latestSignal
    const first = requests.run(original, async signal => { firstSignal = signal; await old.promise })
    await Promise.resolve()
    const changed = [...original]; changed[index] = replacement
    const second = requests.run(changed, async signal => { latestSignal = signal; await latest.promise })
    await Promise.resolve()
    assert.equal(firstSignal.aborted, true)
    assert.equal(latestSignal.aborted, false)
    old.resolve(); await first // A late completion cannot clear the replacement.
    assert.equal(requests.run(changed, async () => assert.fail('duplicate work')), second)
    latest.resolve(); await second
  }
})

test('logout/unmount cancels private pending work even when the next account has the same IDs', async () => {
  const requests = createMapRequestCoalescer(), pending = deferred()
  const sameIds = [1, 2], key = [{ likedIds: sameIds }]
  let signal, calls = 0
  const old = requests.run(key, async value => { signal = value; calls++; await pending.promise })
  await Promise.resolve(); requests.cancel()
  assert.equal(signal.aborted, true)
  const fresh = requests.run(key, async () => { calls++ })
  assert.notEqual(old, fresh)
  await fresh; pending.resolve(); await old
  assert.equal(calls, 2)
})

test('a superseded request scheduled in the same turn never starts', async () => {
  const requests = createMapRequestCoalescer()
  const old = requests.run([1], async () => assert.fail('cancelled before start'))
  const latest = requests.run([2], async () => {})
  await Promise.all([old, latest])
})
