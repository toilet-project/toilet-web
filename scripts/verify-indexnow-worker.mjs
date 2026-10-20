// Linux CI: compiled native scheduled handler + local R2/D1 only. All external fetches are mocked/denied.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes, createHmac } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { createIndexNowManageRequest } from '../indexnow-dispatch.mjs'

assert.equal(process.platform, 'linux')
const state = await mkdtemp(join(tmpdir(), 'geupddong-indexnow-'))
const cli = resolve('node_modules/wrangler/bin/wrangler.js'), origin = 'http://127.0.0.1:18791'
const secret = randomBytes(32).toString('hex'), wait = ms => new Promise(done => setTimeout(done, ms))
let child, logs = ''
async function probe(method = 'GET') {
  const response = await fetch(origin + '/__local-indexnow-proof', { method, headers: { 'x-local-proof': secret },
    signal: AbortSignal.timeout(30_000) })
  assert.equal(response.status, 200, logs)
  return response.json()
}
try {
  const worker = JSON.stringify(resolve('custom-worker.mjs')), main = join(state, 'probe.mjs')
  await writeFile(main, 'import handler from ' + worker + ';\nexport {DOQueueHandler} from ' + worker + ';\n'
    + await readFile('tests/fixtures/indexnow-worker-probe.mjs', 'utf8'))
  const source = JSON.parse(await readFile('wrangler.production.jsonc', 'utf8'))
  const config = { ...source, name: 'local-indexnow-proof', main, routes: [], workers_dev: false, preview_urls: false,
    assets: { ...source.assets, directory: resolve('.open-next/assets') }, observability: { enabled: false },
    services: [{ binding: 'WORKER_SELF_REFERENCE', service: 'local-indexnow-proof' }],
    r2_buckets: [{ binding: 'NEXT_INC_CACHE_R2_BUCKET', bucket_name: 'local-indexnow-proof' },
      { binding: 'PUBLIC_TOILET_DATA_CACHE_R2', bucket_name: 'local-indexnow-proof' }],
    d1_databases: [{ binding: 'NEXT_TAG_CACHE_D1', database_name: 'local-indexnow-proof', database_id: '00000000-0000-0000-0000-000000000001' }],
    vars: { ...source.vars, SITE_INDEXABLE: 'true', INDEXNOW_ENABLED: 'true', INDEXNOW_OUTBOX_ENABLED: 'true',
      SHARED_TOILET_CACHE_ENABLED: 'true', MAP_CLUSTER_CACHE_ENABLED: 'false', PLACE_SEARCH_ENABLED: 'false' } }
  const path = join(state, 'wrangler.json')
  await writeFile(path, JSON.stringify(config))
  const init = spawnSync(process.execPath, [cli, 'd1', 'execute', 'local-indexnow-proof', '--local', '--config', path,
    '--persist-to', state, '--command', 'CREATE TABLE IF NOT EXISTS revalidations (tag TEXT PRIMARY KEY,revalidatedAt INTEGER NOT NULL,stale INTEGER,expire INTEGER);'],
  { encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } })
  assert.equal(init.status, 0, init.stderr)
  child = spawn(process.execPath, [cli, 'dev', '--local', '--config', path, '--port', '18791', '--persist-to', state,
    '--show-interactive-dev-session=false', '--var', 'CACHE_REVALIDATION_SECRET:' + secret],
  { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } })
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { logs = (logs + data.toString().replaceAll(secret, '[test-key]')).slice(-15_000) })
  let ready = false
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) break
    try { if ((await fetch(origin + '/version.json', { signal: AbortSignal.timeout(500) })).ok) { ready = true; break } } catch {}
    await wait(250)
  }
  assert.ok(ready, logs)
  await probe('POST')
  const revalidatePath = '/_internal/cache/revalidate', timestamp = String(Math.floor(Date.now() / 1000))
  const body = JSON.stringify({ contractVersion: 2, events: [{ toiletId: 177, revision: 2, action: 'UPSERT', catalogChanged: true }] })
  const signature = createHmac('sha256', secret).update('v1\nPOST\n' + revalidatePath + '\n' + timestamp + '\n' + body).digest('hex')
  const updated = await fetch(origin + revalidatePath, { method: 'POST', body, signal: AbortSignal.timeout(30_000),
    headers: { 'content-type': 'application/json', 'x-cache-timestamp': timestamp, 'x-cache-signature': signature } })
  assert.equal(updated.status, 200, logs); await updated.arrayBuffer()
  const received = await probe('PUT')
  assert.equal(received.detailReads, 1, logs); assert.equal(received.submissions, 1, logs)
  assert.equal(received.cacheState, 'invalidated'); assert.equal(received.jobs[0].state, 'received')
  assert.equal(received.jobs[0].status, 202)
  assert.ok(received.submittedPaths.some(value => value.includes('검증-이전-화장실')))
  assert.ok(received.submittedPaths.some(value => value.includes('검증-변경-화장실')))
  assert.equal((await probe('PUT')).submissions, 1, 'Native scheduler obeys shared frequency across calls')
  const managePath = '/_internal/indexnow/manage'
  const denied = await fetch(origin + managePath, { method: 'POST', body: '{}' })
  assert.equal(denied.status, 401); await denied.arrayBuffer()
  const signed = await createIndexNowManageRequest(secret, { action: 'inspect', kind: 'outbox' })
  const managed = await fetch(new Request(origin + managePath, signed), { signal: AbortSignal.timeout(15_000) })
  assert.equal(managed.status, 200, logs)
  const inspected = await managed.json()
  assert.equal(inspected.records[0].state, 'received'); assert.equal(inspected.scope, 'page')
  assert.ok(!JSON.stringify(inspected).includes('/regions/'))
  const report = { passed: true, storage: 'isolated local R2/D1', externalNetwork: 'mocked or denied',
    nativeScheduledHandler: true, receiptStatus: 202, originReads: 1, submissions: 1,
    managementAuthentication: true, duplicateScheduleSuppressed: true, originalCacheStillInvalidated: true }
  await writeFile('indexnow-worker-report.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  if (child && child.exitCode === null) {
    const stopped = new Promise(done => child.once('exit', done)); child.kill('SIGTERM')
    await Promise.race([stopped, wait(5000)])
    if (child.exitCode === null) { child.kill('SIGKILL'); await stopped }
  }
  if (!resolve(state).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe temporary path')
  await rm(state, { recursive: true, force: true })
}
