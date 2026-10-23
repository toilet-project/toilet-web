import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createAwardNoticeStore, decodeAwardNotices } from '../src/lib/growthAwardNotices.ts'

const notice = (id = '1') => ({ id, badge: { type: 'district', code: '30110', name: '대전 동구', tier: null, xp: 20, earnedAt: '2026-10-23T12:00:00' } })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
test('automatic notices require both explicit public build flags and stay off by default', () => {
  const config = new URL('../next.config.ts', import.meta.url).href
  for (const [growth, notices, expected] of [['false', 'false', 'false'], ['false', 'true', 'false'], ['true', 'false', 'false'], ['true', 'true', 'true']]) {
    const output = execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `import config from ${JSON.stringify(config)}; console.log(config.env.NEXT_PUBLIC_GROWTH_AWARD_NOTICES_ENABLED)`], {
      encoding: 'utf8', env: { ...process.env, NEXT_PUBLIC_GROWTH_ENABLED: growth, NEXT_PUBLIC_GROWTH_AWARD_NOTICES_ENABLED: notices },
    })
    assert.equal(output.trim(), expected)
  }
})

test('the notice uses a plain white background without a gradient halo', async () => {
  const css = await readFile(new URL('../src/components/growth/award-notice.css', import.meta.url), 'utf8')
  assert.match(css, /^\.award-notice\{[^}]*background:#fff;/)
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\(/i)
})

test('single awards have no filler line and the demonstration label never renders for a real award', async () => {
  const component = await readFile(new URL('../src/components/growth/GrowthAwardNotifications.tsx', import.meta.url), 'utf8')
  const labels = await readFile(new URL('../src/i18n/awardNoticeText.ts', import.meta.url), 'utf8')
  assert.match(component, /\{badges\.length > 1 && <p className="award-notice-eyebrow">\{t\.multiple/)
  assert.match(component, /\{demo && <p className="award-notice-demo">\{t\.demo\}<\/p>\}/)
  assert.doesNotMatch(component, /\bt\.single\b/)
  assert.doesNotMatch(labels, /\bsingle\s*:/)
})

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

test('the mobile map mounts notices independently of the desktop-only profile menu without eagerly loading badge datasets', async () => {
  const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /const GrowthAwardNotifications = lazy\(\(\) => import\('\.\/components\/growth\/GrowthAwardNotifications'\)/)
  assert.match(app, /!isDesktop && authProfile && <Suspense fallback=\{null\}><GrowthAwardNotifications profile=\{authProfile\} \/><\/Suspense>/)
  assert.doesNotMatch(app, /^import .*GrowthAwardNotifications.* from /m)
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
