// Public GET-only deployment smoke. No cookies, member API calls or profile writes.
import assert from 'node:assert/strict'

const origin = new URL(process.argv[2])
assert.equal(origin.protocol, 'https:')
assert.ok(['preview.geupddong.com', 'geupddong.com'].includes(origin.hostname), 'Use the approved preview or production origin')
assert.equal(origin.pathname, '/')
assert.equal(origin.search, '')
const results = []
const pages = ['/account', '/growth/ranks', '/growth/levels', '/en/growth/ranks', '/ja/growth/levels', '/zh-cn/growth/ranks', '/zh-tw/growth/levels', '/zh-hk/growth/ranks']
for (const path of pages) {
  const response = await fetch(new URL(path, origin), { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(30_000) })
  const html = await response.text()
  assert.equal(response.status, 200, path)
  assert.match(response.headers.get('content-type') || '', /text\/html/, path)
  assert.match(response.headers.get('cache-control') || '', /no-store/, `${path}: navigation must not be cached`)
  assert.ok(/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/.test(html) || /noindex/.test(response.headers.get('x-robots-tag') || ''), `${path}: private/noindex route`)
  assert.match(html, path === '/account' ? /account-page-main/ : /id="growth-page-title"/, `${path}: expected page`)
  results.push({ path, status: response.status })
}
const assets = [
  ...['01-sprout', '02-heart', '03-flame', '04-bolt', '05-star', '06-crown', '07-legend'].map(file => `/growth/rank-icons/v14/${file}.svg`),
  ...['05-star', '06-crown', '07-legend'].map(file => `/growth/rank-icons/v14/compact/${file}.gif`),
  '/growth/district-studies/v2/30140.svg', '/growth/badges/v13/new/standard-gold/30.svg',
]
for (const path of assets) {
  const response = await fetch(new URL(path, origin), { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(30_000) })
  assert.equal(response.status, 200, path)
  assert.match(response.headers.get('content-type') || '', path.endsWith('.gif') ? /image\/gif/ : /image\/svg\+xml/, path)
  assert.ok((await response.arrayBuffer()).byteLength > 50, `${path}: empty asset`)
  results.push({ path, status: response.status })
}
console.log(JSON.stringify({ verified: true, origin: origin.origin, results, note: 'Public routes and assets only. Authenticated growth, check-in and profile editing require separate browser verification.' }, null, 2))
