import assert from 'node:assert/strict'
import test from 'node:test'
import { createRecoveryExit } from '../src/lib/recoveryExit.ts'

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

test('recovery fallback cancels server recovery before replacing the localized home page', async () => {
  const cancellation = deferred()
  const events = []
  const leave = createRecoveryExit({ cancel: () => { events.push('cancel'); return cancellation.promise },
    replace: path => events.push(path), home: '/ja' })
  const pending = leave()
  await Promise.resolve()
  assert.deepEqual(events, ['cancel'])
  cancellation.resolve()
  await pending
  assert.deepEqual(events, ['cancel', '/ja'])
})

test('duplicate recovery exit actions share cancellation and navigation while it is pending or complete', async () => {
  const cancellation = deferred()
  let cancels = 0, navigations = 0
  const leave = createRecoveryExit({ cancel: () => { cancels++; return cancellation.promise },
    replace: () => { navigations++ }, home: '/' })
  const first = leave()
  assert.equal(leave(), first)
  cancellation.resolve()
  await first
  assert.equal(leave(), first)
  assert.equal(cancels, 1)
  assert.equal(navigations, 1)
})

test('a failed recovery cancellation never navigates away and permits an explicit retry', async () => {
  const events = []
  let calls = 0
  const leave = createRecoveryExit({ cancel: async () => {
    events.push('cancel')
    if (++calls === 1) throw new Error('offline')
  }, replace: path => events.push(path), home: '/en' })
  await assert.rejects(leave(), /offline/)
  assert.deepEqual(events, ['cancel'])
  await leave()
  assert.deepEqual(events, ['cancel', 'cancel', '/en'])
})
