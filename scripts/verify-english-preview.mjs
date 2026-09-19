// Read-only deployment smoke. No cookies, login, consent, mutations or real GPS.
import assert from 'node:assert/strict'
const origin = 'https://preview.geupddong.com'
const id = process.argv[2] || '13448'
assert.match(id, /^[1-9]\d*$/)
const rows = []
for (const path of ['/', '/en', `/toilet/${id}`, `/en/toilet/${id}`, '/en/toilet/0', '/en/toilet/nope', '/robots.txt', '/admin-toilets-preview/']) {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(30_000), redirect: 'follow' })
  const body = await response.text()
  const expected = path.endsWith('/0') || path.endsWith('/nope') ? 404 : 200
  assert.equal(response.status, expected, path)
  if (path === '/robots.txt') assert.match(body, /Disallow: \//)
  else if (!path.startsWith('/admin-')) {
    assert.match(response.headers.get('x-robots-tag') || '', /noindex/, path)
    assert.match(response.headers.get('cache-control') || '', /no-store/, path)
    if (response.status === 200) assert.match(body, new RegExp(`<html[^>]*lang="${path.startsWith('/en') ? 'en' : 'ko'}"`), path)
    if (path.startsWith('/en/toilet/') && response.status === 200) {
      assert.ok(body.includes(`https://geupddong.com/en/toilet/${id}`), 'English canonical path')
      const structured = body.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)
      assert.ok(structured, 'Server-rendered Place metadata')
      assert.equal(JSON.parse(structured[1])['@type'], 'Place')
    }
  } else assert.ok(body.includes('/admin-toilets-preview/toilets.js'), 'Existing admin preview remains')
  rows.push({ path, status: response.status, cache: response.headers.get('cache-control') })
}
console.log(JSON.stringify({ passed: true, rows }, null, 2))
