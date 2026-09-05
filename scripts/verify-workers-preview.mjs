// Public read-only smoke; never treats response latency as CPU time.
import assert from 'node:assert/strict'
const origin = new URL(process.argv[2])
const id = process.argv[3] || '13448'
assert.equal(origin.protocol, 'https:')
assert.ok(origin.hostname.startsWith('geupddong-web-preview.') && origin.hostname.endsWith('.workers.dev'))
assert.match(id, /^[1-9]\d*$/)
const results = []
for (const path of ['/', '/robots.txt', `/toilet/${id}`, `/toilet/${id}`, '/toilet/0', '/toilet/not-a-number']) {
  const start = performance.now()
  const response = await fetch(new URL(path, origin), {signal:AbortSignal.timeout(30_000)})
  const html = await response.text()
  results.push({path,status:response.status,latencyMs:Math.round(performance.now()-start),cache:response.headers.get('x-nextjs-cache'),cfCache:response.headers.get('cf-cache-status')})
  assert.equal(response.status, path.includes('/toilet/0') || path.includes('not-a-number') ? 404 : 200, JSON.stringify(results))
  if (path === '/robots.txt') assert.match(html,/Disallow: \//)
  else assert.match(response.headers.get('x-robots-tag') || '', /noindex/)
  if(path === `/toilet/${id}`) {
    assert.ok(html.includes(`https://geupddong.com/toilet/${id}`),'canonical')
    const match=html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)
    assert.ok(match,'server JSON-LD')
    assert.equal(JSON.parse(match[1])['@type'],'Place')
  }
}
console.log(JSON.stringify({results,note:'Small runtime sample only; latency is NOT CPU time. Map/OAuth/production region projection not verified.'},null,2))
