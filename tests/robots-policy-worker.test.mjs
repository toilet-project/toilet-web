import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../robots-policy-worker.mjs'

const request = (host, method = 'GET', path = '/robots.txt') => worker.fetch(new Request(`https://${host}${path}`, { method }))

test('public website opts out Apple training and preserves public search and sitemap', async () => {
  const response = request('geupddong.com')
  assert.equal(response.status, 200)
  const text = await response.text()
  assert.match(text, /User-agent: Applebot-Extended\nDisallow: \/\n/)
  assert.match(text, /User-agent: \*\nAllow: \/\nDisallow: \/api\//)
  assert.match(text, /Sitemap: https:\/\/geupddong.com\/sitemap.xml/)
  assert.doesNotMatch(text, /User-agent: Applebot\s*\n/i)
  assert.doesNotMatch(text, /User-agent: (Googlebot|Bingbot|OAI-SearchBot)\s*\n/i)
})

test('API opts out Apple training while keeping other crawlers allowed', async () => {
  const response = request('api.geupddong.com')
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'User-agent: Applebot-Extended\nDisallow: /\n\nUser-agent: *\nAllow: /\n')
})

test('preview remains excluded from indexing and explicitly opts out Apple training', async () => {
  const response = request('preview.geupddong.com')
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.match(await response.text(), /User-agent: \*\nDisallow: \/\n/)
})

test('only the three known hosts and the robots pathname are served', () => {
  for (const host of ['admin.geupddong.com', 'other.example']) assert.equal(request(host).status, 404)
  for (const path of ['/api/v1/toilets', '/robots.txt-other', '/robots.txt/']) assert.equal(request('api.geupddong.com', 'GET', path).status, 404)
  assert.equal(request('geupddong.com', 'GET', '/robots.txt?audit=1').status, 200)
})

test('HEAD has no body and writes are rejected without proxying to an application', async () => {
  const head = request('api.geupddong.com', 'HEAD')
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  assert.match(head.headers.get('content-type'), /^text\/plain/)
  const post = request('api.geupddong.com', 'POST')
  assert.equal(post.status, 405)
  assert.equal(post.headers.get('allow'), 'GET, HEAD')
})
