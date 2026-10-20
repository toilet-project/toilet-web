import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { basename, resolve } from 'node:path'
import { signatureFor, REVALIDATION_PATH } from '../src/server/cacheRevalidation.ts'
import { readThroughSharedToiletCache, sharedToiletCacheKey } from '../src/server/sharedToiletCache.ts'
import { indexNowMemory } from './fixtures/indexnow-memory.mjs'
import { runScheduledIndexNow } from '../indexnow-dispatch.mjs'

const require = createRequire(import.meta.url)
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'))
const { build } = wranglerRequire('esbuild')
// Execute the real signed route, durable producer, intent store and detail invalidation.
// Only Next cache hooks, Cloudflare context and unrelated cache backends are replaced.
const result = await build({ entryPoints: {
  revalidate: fileURLToPath(new URL('../src/app/%255Finternal/cache/revalidate/route.ts', import.meta.url)),
  dispatch: fileURLToPath(new URL('../src/app/%255Finternal/indexnow/dispatch/route.ts', import.meta.url)),
}, outdir: 'isolated-route-memory',
  bundle: true, write: false, format: 'esm', platform: 'node', target: 'node24', logLevel: 'silent',
  plugins: [{ name: 'isolated-route-backends', setup(builder) {
    builder.onResolve({ filter: /^next\/cache$|^@opennextjs\/cloudflare$/ }, args => ({ path: args.path, namespace: 'test' }))
    builder.onResolve({ filter: /(workerInvalidation|mapCellCache|mapFilterCache|mapClusterCache|regionMarkerCache|regions)(\.ts)?$/ }, args => {
      const absolute = resolve(args.resolveDir, args.path).replaceAll('\\', '/')
      if (absolute.includes('/src/server/')) return { path: basename(absolute).replace('.ts', ''), namespace: 'test' }
    })
    builder.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: {
      'next/cache': `export function revalidatePath(){ globalThis.__indexnowRoute.calls.push('revalidatePath') }
        export function revalidateTag(){ globalThis.__indexnowRoute.calls.push('revalidateTag') }`,
      '@opennextjs/cloudflare': `export async function getCloudflareContext(){ return globalThis.__indexnowRoute.context }`,
      workerInvalidation: `export async function persistWorkerInvalidation(){ globalThis.__indexnowRoute.calls.push('worker') }`,
      mapCellCache: `export async function persistMapCellInvalidation(){ globalThis.__indexnowRoute.calls.push('cells') }
        export async function getMapCellBucket(){ return null }`,
      mapFilterCache: `export async function persistMapFilterInvalidation(){ globalThis.__indexnowRoute.calls.push('filters') }`,
      mapClusterCache: `export async function invalidateMapClusterCache(){ globalThis.__indexnowRoute.calls.push('clusters') }`,
      regionMarkerCache: `export async function persistRegionMarkerInvalidation(){ globalThis.__indexnowRoute.calls.push('regions'); return new Map() }`,
      regions: `export function districtCodesOverlappingBounds(){ return ['11110'] }
        export async function getCurrentDistrictToiletsForIndexNow(){ throw new Error('unexpected district origin read') }`,
    }[args.path], loader: 'js' }))
  } }],
})
const bundled = name => import('data:text/javascript;base64,' + Buffer.from(result.outputFiles.find(file =>
  basename(file.path) === name + '.js').text).toString('base64'))
const route = await bundled('revalidate'), dispatchRoute = await bundled('dispatch')
const secret = 'test-only-route-signing-secret-32-bytes-long'
const event = { toiletId: 177, revision: 2, action: 'UPSERT', catalogChanged: true }
function request(signature) {
  const body = JSON.stringify({ contractVersion: 2, events: [event] })
  const timestamp = String(Math.floor(Date.now() / 1000))
  return new Request('https://geupddong.com' + REVALIDATION_PATH, { method: 'POST', body,
    headers: { 'content-type': 'application/json', 'x-cache-timestamp': timestamp,
      'x-cache-signature': signature ?? signatureFor(secret, timestamp, body) } })
}
async function setup() {
  const savedEnv = { ...process.env }, f = indexNowMemory()
  Object.assign(process.env, { SITE_INDEXABLE: 'true', INDEXNOW_ENABLED: 'true', INDEXNOW_OUTBOX_ENABLED: 'true',
    SHARED_TOILET_CACHE_ENABLED: 'true', CACHE_REVALIDATION_SECRET: secret,
    REGION_MARKER_CACHE_ENABLED: 'false', MAP_CLUSTER_CACHE_ENABLED: 'false' })
  globalThis.__indexnowRoute = { calls: [], context: { env: { PUBLIC_TOILET_DATA_CACHE_R2: f.bucket },
    ctx: { waitUntil() { throw new Error('no best-effort network scheduling in durable mode') } } } }
  await readThroughSharedToiletCache({ bucket: f.bucket, toiletId: 177,
    fetchOrigin: async () => ({ id: 177, name: '사직주유소', latitude: 37.575, longitude: 126.968,
      maleToiletCount: 1, maleUrinalCount: 1, maleDisabledToiletCount: 0, maleDisabledUrinalCount: 0,
      maleChildToiletCount: 0, maleChildUrinalCount: 0, femaleToiletCount: 1,
      femaleDisabledToiletCount: 0, femaleChildToiletCount: 0 }) })
  return { ...f, restore() { process.env = savedEnv; delete globalThis.__indexnowRoute } }
}

test('real signed HTTP route returns 503 before any cache mutation when intent storage fails', async () => {
  const f = await setup()
  try {
    const old = f.objects.get(sharedToiletCacheKey(177)).body
    const put = f.bucket.put
    f.bucket.put = async (key, ...args) => {
      if (key.startsWith('indexnow/intents/')) throw new Error('offline')
      return put(key, ...args)
    }
    assert.equal((await route.POST(request())).status, 503)
    assert.deepEqual(globalThis.__indexnowRoute.calls, [])
    assert.equal(f.objects.get(sharedToiletCacheKey(177)).body, old)
  } finally { f.restore() }
})

test('real signed route retains original paths across release failure, invalidated cache and sender retry', async () => {
  const f = await setup()
  try {
    const put = f.bucket.put
    f.bucket.put = async (key, body, ...args) => {
      if (key.startsWith('indexnow/intents/') && JSON.parse(body).state === 'pending') throw new Error('release unavailable')
      return put(key, body, ...args)
    }
    assert.equal((await route.POST(request())).status, 503)
    const staged = f.records('indexnow/intents/')[0]
    assert.equal(staged.state, 'staged')
    assert.ok(staged.intent.formerPaths.some(path => path.includes('사직주유소')))
    assert.equal(JSON.parse(f.objects.get(sharedToiletCacheKey(177)).body).state, 'invalidated')
    f.bucket.put = put
    const response = await route.POST(request())
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true, acceptedEvents: [{ toiletId: 177, revision: 2 }] })
    const pending = f.records('indexnow/intents/')[0]
    assert.equal(pending.state, 'pending')
    assert.deepEqual(pending.intent.formerPaths, staged.intent.formerPaths)
    assert.equal(f.records('indexnow/intents/').length, 1)
  } finally { f.restore() }
})

test('invalid signatures return 401 without reading or writing durable/cache storage', async () => {
  const f = await setup()
  try {
    f.bucket.get = async () => { throw new Error('unauthenticated storage access') }
    assert.equal((await route.POST(request('0'.repeat(64)))).status, 401)
    assert.deepEqual(globalThis.__indexnowRoute.calls, [])
  } finally { f.restore() }
})

test('real cache route and signed scheduled route persist a remote receipt with outbound calls isolated', async () => {
  const f = await setup(), originalFetch = globalThis.fetch
  try {
    assert.equal((await route.POST(request())).status, 200)
    const detailCache = f.objects.get(sharedToiletCacheKey(177)).body
    const calls = []
    globalThis.fetch = async (url, init) => {
      calls.push(String(url))
      if (String(url) === 'https://api.geupddong.com/api/v1/toilets/177')
        return Response.json({ id: 177, name: '새 이름', latitude: 37.575, longitude: 126.968 })
      assert.equal(String(url), 'https://api.indexnow.org/indexnow')
      const payload = JSON.parse(init.body)
      assert.ok(payload.urlList.some(url => decodeURI(url).includes('사직주유소')))
      assert.ok(payload.urlList.some(url => decodeURI(url).includes('새-이름')))
      return new Response('', { status: 202 })
    }
    assert.equal((await runScheduledIndexNow(process.env, request => dispatchRoute.POST(request))).state, 'dispatched')
    assert.equal(calls.length, 2)
    assert.equal(f.records('indexnow/outbox/')[0].state, 'received')
    assert.equal(f.records('indexnow/outbox/')[0].status, 202)
    assert.equal(f.objects.get(sharedToiletCacheKey(177)).body, detailCache)
    await runScheduledIndexNow(process.env, request => dispatchRoute.POST(request))
    assert.equal(calls.length, 2)
  } finally { globalThis.fetch = originalFetch; f.restore() }
})

test('dispatch route rejects unsigned callers and disabled preview without storage access', async () => {
  const f = await setup()
  try {
    f.bucket.get = async () => { throw new Error('unexpected storage access') }
    const unsigned = () => new Request('https://geupddong.com/_internal/indexnow/dispatch', { method: 'POST', body: '{}' })
    assert.equal((await dispatchRoute.POST(unsigned())).status, 401)
    process.env.SITE_INDEXABLE = 'false'
    assert.equal((await dispatchRoute.POST(unsigned())).status, 404)
  } finally { f.restore() }
})
