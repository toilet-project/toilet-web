// Linux CI only: isolated local R2/D1, public facility reads, no production writes.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

assert.equal(process.platform, 'linux')
const state = await mkdtemp(join(tmpdir(), 'geupddong-detail-cold-'))
const origin = 'http://127.0.0.1:18790'
const cli = resolve('node_modules/wrangler/bin/wrangler.js')
const config = 'wrangler.production.jsonc'
const secret = randomBytes(32).toString('hex')
const sleep = ms => new Promise(done => setTimeout(done, ms))
let child, logs = ''
const cache = response => response.headers.get('x-opennext-cache') || response.headers.get('x-nextjs-cache')
async function start() {
  child = spawn(process.execPath, [cli, 'dev', '--local', '--config', config, '--port', '18790',
    '--persist-to', state, '--show-interactive-dev-session=false', '--var', `CACHE_REVALIDATION_SECRET:${secret}`,
    '--var', 'INDEXNOW_ENABLED:false'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } })
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
    logs = (logs + chunk.toString().replaceAll(secret, '[local-test-key]')).slice(-12000)
  })
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) break
    try { if ((await fetch(origin + '/version.json', { signal: AbortSignal.timeout(500) })).ok) return } catch { /* starting */ }
    await sleep(250)
  }
  throw Error(`Local Worker failed to start: ${logs}`)
}
async function stop() {
  if (!child || child.exitCode !== null) return
  const exited = new Promise(done => child.once('exit', done))
  child.kill('SIGTERM')
  await Promise.race([exited, sleep(5000)])
  if (child.exitCode === null) { child.kill('SIGKILL'); await exited }
}
async function page(path, options) {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(30000), ...options })
  const body = await response.text()
  assert.equal(response.status, 200, `${path}: ${response.status}\n${logs}`)
  assert.match(response.headers.get('cache-control') || '', /no-store/)
  return { response, body, cache: cache(response) }
}
try {
  const init = spawnSync(process.execPath, [cli, 'd1', 'execute', 'geupddong-next-production-tags', '--local',
    '--config', config, '--persist-to', state, '--command',
    'CREATE TABLE IF NOT EXISTS revalidations (tag TEXT PRIMARY KEY, revalidatedAt INTEGER NOT NULL, stale INTEGER, expire INTEGER);'],
  { encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } })
  assert.equal(init.status, 0, 'Local D1 setup failed')
  await start()
  const paths = []
  for (const locale of ['', '/en', '/ja', '/zh-cn', '/zh-tw', '/zh-hk']) {
    const legacy = `${locale}/toilet/13448`
    const first = await page(legacy)
    const canonical = first.body.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
    assert.ok(canonical, 'Missing canonical')
    paths.push(legacy, new URL(canonical).pathname)
    await page(new URL(canonical).pathname)
  }
  await sleep(1500) // Let pending cache writes finish before destroying the process.
  await stop()
  await sleep(2000) // Exceed Next's cold-instance fallback of one second.
  await start()
  for (const path of [...new Set(paths)]) {
    const hit = await page(path)
    assert.equal(hit.cache, 'HIT', `Cold process did not reuse stored lifetime: ${path} (${hit.cache})`)
    const rsc = await page(path, { headers: { RSC: '1' } })
    assert.equal(rsc.cache, 'HIT', 'RSC should reuse the same entry')
    assert.match(rsc.response.headers.get('content-type') || '', /text\/x-component/)
    assert.doesNotMatch(rsc.body, /<!DOCTYPE html>/i)
  }
  const path = '/_internal/cache/revalidate'
  const body = JSON.stringify({ toiletIds: [13448] })
  const rejected = await fetch(origin + path, { method: 'POST', body, headers: { 'content-type': 'application/json' } })
  await rejected.arrayBuffer()
  assert.equal(rejected.status, 401)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', secret).update(`v1\nPOST\n${path}\n${timestamp}\n${body}`).digest('hex')
  const invalidated = await fetch(origin + path, { method: 'POST', body, headers: {
    'content-type': 'application/json', 'x-cache-timestamp': timestamp, 'x-cache-signature': signature,
  }, signal: AbortSignal.timeout(30000) })
  await invalidated.arrayBuffer()
  assert.equal(invalidated.status, 200, `Local invalidation failed: ${logs}`)
  for (const url of [...new Set(paths)]) {
    assert.notEqual((await page(url)).cache, 'HIT', `Invalidated HTML must not be reused: ${url}`)
    await sleep(250)
    assert.equal((await page(url)).cache, 'HIT', `Refilled HTML should be fresh: ${url}`)
  }
  const missing = await fetch(origin + '/toilet/999999999999', { signal: AbortSignal.timeout(30000) })
  await missing.arrayBuffer()
  assert.equal(missing.status, 404)
  assert.match(missing.headers.get('cache-control') || '', /no-store/)
  console.log(JSON.stringify({ passed: true, locales: 6, coldHtmlAndRsc: paths.length, invalidation: 'miss then hit', storage: 'local only' }))
} finally {
  await stop()
  if (!resolve(state).startsWith(resolve(tmpdir()) + sep)) throw Error('Unsafe temporary path')
  await rm(state, { recursive: true, force: true })
}
