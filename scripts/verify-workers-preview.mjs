// Public read-only smoke; never treats response latency as CPU time.
import assert from 'node:assert/strict'
const origin = new URL(process.argv[2])
const id = process.argv[3] || '13448'
assert.equal(origin.protocol, 'https:')
assert.ok(origin.hostname === 'preview.geupddong.com' || origin.hostname === 'geupddong-web-preview.dlgksqls7218.workers.dev')
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
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)
    assert.ok(canonical, 'canonical')
    const canonicalUrl = new URL(canonical[1])
    assert.equal(canonicalUrl.origin, 'https://geupddong.com')
    const [, regions, sido, sigungu, toilet, facility] = canonicalUrl.pathname.split('/')
    assert.equal(regions, 'regions')
    assert.match(sido, /^\d{2}$/)
    assert.match(sigungu, /^\d{5}$/)
    assert.equal(toilet, 'toilet')
    assert.ok(facility.startsWith(`${id}-`) && facility.length > id.length + 1, 'facility slug')
    const match=html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)
    assert.ok(match,'server JSON-LD')
    assert.equal(JSON.parse(match[1])['@type'],'Place')
  }
}
console.log(JSON.stringify({results,note:'Small runtime sample only; latency is NOT CPU time. Map/OAuth/production region projection not verified.'},null,2))
