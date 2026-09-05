// Bounded public-read smoke, not a capacity/load or CPU benchmark.
import assert from 'node:assert/strict'
const origin = 'https://preview.geupddong.com'
const paths = ['/toilet/13144', '/toilet/13448', '/', '/policies/privacy']
const results = []
let stop = false
async function request(path, phase) {
  const started = performance.now()
  try {
    const response = await fetch(origin + path, { redirect: 'error', signal: AbortSignal.timeout(15000) })
    const body = await response.text()
    const row = { phase, path, status: response.status, latencyMs: Math.round(performance.now() - started), cache: response.headers.get('x-nextjs-cache') }
    results.push(row)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('x-robots-tag') || '', /noindex/)
    assert.match(body, /<html/)
    if (path.startsWith('/toilet/')) assert.ok(body.includes('https://geupddong.com' + path))
  } catch (error) {
    stop = true
    results.push({ phase, path, error: error.name })
  }
}
// Four warm-up requests, then twelve pairs; at most 28 requests and 2 in flight.
for (const path of paths) { await request(path, 'warmup'); if (stop) break }
for (let pair = 0; pair < 12 && !stop; pair++) {
  await Promise.all([request(paths[(pair * 2) % paths.length], 'paired'), request(paths[(pair * 2 + 1) % paths.length], 'paired')])
  if (!stop) await new Promise(resolve => setTimeout(resolve, 250))
}
const paired = results.filter(row => row.phase === 'paired' && row.latencyMs != null)
const timings = paired.map(row => row.latencyMs).sort((a,b) => a-b)
const quantile = p => timings.length ? timings[Math.ceil(timings.length * p) - 1] : null
console.log(JSON.stringify({ origin, completedAt: new Date().toISOString(), passed: !stop, concurrency: 2, maxRequests: 28, requestCount: results.filter(row=>row.status).length, pairedLatencyMs: {p50:quantile(.5), p95:quantile(.95), max:timings.at(-1) ?? null}, results, limitations: ['Public GET only; no credentials or business writes', 'Small warm-cache sample, not a capacity guarantee', 'Response latency is not Worker CPU time', 'No cache purge or forced nationwide cold generation'] }, null, 2))
if (stop) process.exitCode = 1
