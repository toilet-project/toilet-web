import assert from 'node:assert/strict'
import test from 'node:test'
import { createClientModuleLoader } from '../src/lib/clientModuleLoader.ts'

test('browser module consumers share one pending and completed load', async () => {
  let finish, calls = 0
  const load = createClientModuleLoader(() => { calls++; return new Promise(resolve => { finish = resolve }) })
  const a = load(), b = load()
  assert.equal(a, b)
  await Promise.resolve()
  assert.equal(calls, 1)
  const module = { default: () => 'map' }
  finish(module)
  assert.equal(await a, module)
  assert.equal(load(), a)
  assert.equal(await load(), module)
  assert.equal(calls, 1)
})

test('a failed browser chunk is not permanently cached, including a synchronous loader failure', async () => {
  let calls = 0
  const load = createClientModuleLoader(() => {
    if (++calls === 1) throw new Error('chunk unavailable')
    return Promise.resolve({ default: 'recovered' })
  })
  const failed = load()
  assert.equal(load(), failed)
  await assert.rejects(failed, /chunk unavailable/)
  assert.deepEqual(await load(), { default: 'recovered' })
  assert.equal(calls, 2)
})
