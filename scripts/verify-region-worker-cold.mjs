// Runs only after the Linux production Worker build. Uses local R2/D1 and one
// public API read; it never connects to production storage or changes data.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

assert.equal(process.platform, 'linux', 'Cold Worker smoke requires the Linux CI runtime')
const state = await mkdtemp(join(tmpdir(), 'geupddong-region-cold-'))
const origin = 'http://127.0.0.1:18789'
const child = spawn(join(process.cwd(), 'node_modules/.bin/wrangler'), [
  'dev', '--local', '--config', 'wrangler.production.jsonc', '--port', '18789',
  '--persist-to', state, '--show-interactive-dev-session=false',
], { cwd: process.cwd(), env: { ...process.env, WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] })
let logs = ''
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { logs = (logs + chunk.toString()).slice(-12_000) })
try {
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) break
    try {
      const response = await fetch(`${origin}/version.json`, { signal: AbortSignal.timeout(500) })
      if (response.ok) { ready = true; break }
    } catch { /* Dev server is starting. */ }
    await new Promise(done => setTimeout(done, 250))
  }
  assert.ok(ready, `Worker dev did not start:\n${logs}`)

  const district = '/regions/%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C-11/%EC%A4%91%EA%B5%AC-11140'
  const page = await fetch(`${origin}${district}`, { signal: AbortSignal.timeout(30_000) })
  const html = await page.text()
  assert.equal(page.status, 200, `Cold district render failed:\n${logs}`)
  assert.match(html, /<h1[^>]*>/)
  const markers = await fetch(`${origin}/api/region-markers/11140`, { signal: AbortSignal.timeout(15_000) })
  assert.equal(markers.status, 200, `Marker cache read failed:\n${logs}`)
  assert.equal(markers.headers.get('x-region-marker-cache'), 'hit', 'First page should populate local R2')
  const body = await markers.json()
  assert.ok(body.count > 0)
  console.log(JSON.stringify({ passed: true, district: '11140', firstPage: page.status,
    followupCache: markers.headers.get('x-region-marker-cache'), count: body.count }))
} finally {
  if (child.exitCode === null) {
    const stopped = new Promise(done => child.once('exit', done))
    child.kill('SIGTERM')
    await Promise.race([stopped, new Promise(done => setTimeout(done, 5_000))])
    if (child.exitCode === null) child.kill('SIGKILL')
  }
  const temporaryRoot = resolve(tmpdir()) + sep
  if (!resolve(state).startsWith(temporaryRoot)) throw new Error('Unsafe temporary path')
  await rm(state, { recursive: true, force: true })
}
