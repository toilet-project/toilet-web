import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createAwardNoticeStore, decodeAwardNotices } from '../src/lib/growthAwardNotices.ts'

const notice = (id = '1') => ({ id, badge: { type: 'district', code: '30110', name: '대전 동구', tier: null, xp: 20, earnedAt: '2026-10-23T12:00:00' } })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
test('the close button paints above the decorative artwork hit area', async () => {
  const css = await readFile(new URL('../src/components/growth/award-notice.css', import.meta.url), 'utf8')
  assert.match(css, /\.award-notice-close\{[^}]*z-index:3/)
})

test('desktop notices stay centered through animation and reduced motion while mobile keeps the bottom card', async () => {
  const css = await readFile(new URL('../src/components/growth/award-notice.css', import.meta.url), 'utf8')
  assert.match(css, /^\.award-notice\{[^}]*left:50%;top:50%;right:auto;bottom:auto;transform:translate\(-50%,-50%\)/)
  assert.match(css, /@keyframes award-appear\{from\{opacity:0;transform:translate\(-50%,calc\(-50% \+ 18px\)\)\}to\{opacity:1;transform:translate\(-50%,-50%\)\}\}/)
  assert.match(css, /@media\(max-width:768px\)\{\.award-notice\{left:auto;top:auto;right:50%;bottom:calc\(79px \+ env\(safe-area-inset-bottom\)\);transform:translateX\(50%\)/)
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.award-notice,\.award-notice-art>span\{animation:none!important\}\}/)
})
test('only valid unique server award IDs and badge types are accepted', () => {
  assert.deepEqual(decodeAwardNotices({ items: [notice()] }), [notice()])
  for (const items of [[notice('0')], [notice(), notice()], [{ ...notice(), badge: { ...notice().badge, tier: 'gold' } }], [{ ...notice(), badge: { ...notice().badge, type: 'invented' } }]]) assert.throws(() => decodeAwardNotices({ items }))
})
test('concurrent surfaces share a read and confirmed notices disappear after one server acknowledgement', async () => {
  const request = deferred(); let reads = 0, writes = 0
  const store = createAwardNoticeStore({ read: () => { reads++; return request.promise }, acknowledge: async ids => { writes++; assert.deepEqual(ids, ['1']) } })
  const a = store.load('a'), b = store.load('a'); request.resolve([notice()]); await Promise.all([a, b])
  assert.equal(reads, 1); assert.equal(store.get('a').items.length, 1)
  await Promise.all([store.acknowledge('a'), store.acknowledge('a')])
  assert.equal(writes, 1); assert.equal(store.get('a').items.length, 0); assert.equal(store.get('b').items.length, 0)
})
test('failed acknowledgement is visible and a retry is explicit, never automatically replayed', async () => {
  let writes = 0
  const store = createAwardNoticeStore({ read: async () => [notice()], acknowledge: async () => { if (++writes === 1) throw new Error('offline') } })
  await store.load('a'); assert.equal(await store.acknowledge('a'), false)
  assert.equal(writes, 1); assert.equal(store.get('a').error, true); assert.equal(store.get('a').items.length, 1)
  assert.equal(await store.acknowledge('a'), true); assert.equal(writes, 2); assert.equal(store.get('a').items.length, 0)
})
test('sign-out invalidates pending member reads and acknowledgement results', async () => {
  const request = deferred()
  const store = createAwardNoticeStore({ read: () => request.promise, acknowledge: async () => {} })
  const loading = store.load('a'); store.clear(); request.resolve([notice()]); await loading
  assert.equal(store.get('a').items.length, 0); assert.equal(store.get('b').items.length, 0)
})
test('a read during acknowledgement waits for the committed server view', async () => {
  const saving = deferred(); let saved = false, reads = 0
  const store = createAwardNoticeStore({ read: async () => { reads++; return saved ? [] : [notice()] }, acknowledge: async () => { await saving.promise; saved = true } })
  await store.load('a'); const ack = store.acknowledge('a'), loading = store.load('a')
  assert.equal(reads, 1); saving.resolve(); await Promise.all([ack, loading]); assert.equal(reads, 2); assert.equal(store.get('a').items.length, 0)
})
