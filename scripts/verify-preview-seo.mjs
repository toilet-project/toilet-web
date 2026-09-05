// Bounded, public, read-only integration check. No logins, geocoding or DB updates.
import assert from 'node:assert/strict'
import { validateSitemapIds } from '../src/lib/seo.ts'
import { regionLabel } from '../src/lib/toiletRoute.ts'

const preview = 'https://preview.geupddong.com'
const api = 'https://api.geupddong.com/api/v1/toilets'
const expectedTotal = Number(process.argv[2])
assert.ok(Number.isSafeInteger(expectedTotal) && expectedTotal > 0, 'Supply the read-only DB count')
async function read(url, status = 200) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  assert.equal(response.status, status, `${url}: expected ${status}, received ${response.status}`)
  return response
}
const xmlLocations = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
const shards = validateSitemapIds(await (await read(`${api}/sitemap/shards`)).json())
// This check is for the current six-shard data set, not an unbounded crawler.
assert.ok(shards.length <= 10, 'Review scope before increasing requests')
const indexResponse = await read(`${preview}/sitemap.xml`)
assert.match(indexResponse.headers.get('x-robots-tag') || '', /noindex/)
const index = xmlLocations(await indexResponse.text())
assert.deepEqual(index, ['https://geupddong.com/pages-sitemap.xml', ...shards.map(shard => `https://geupddong.com/sitemap-toilets-${shard}.xml`)])
const allIds = new Set()
const summary = []
for (const shard of shards) {
  const ids = validateSitemapIds(await (await read(`${api}/sitemap/ids?shard=${shard}`)).json(), shard)
  const response = await read(`${preview}/sitemap-toilets-${shard}.xml`)
  assert.match(response.headers.get('content-type') || '', /application\/xml/)
  assert.match(response.headers.get('x-robots-tag') || '', /noindex/)
  const xml = await response.text()
  assert.ok(Buffer.byteLength(xml) < 50 * 1024 * 1024)
  assert.ok(!xml.includes('<lastmod>'), 'Do not invent modification times')
  assert.deepEqual(xmlLocations(xml), ids.map(id => `https://geupddong.com/toilet/${id}`))
  for (const id of ids) {
    assert.ok(!allIds.has(id), `Duplicate ID ${id}`)
    allIds.add(id)
  }
  summary.push({ shard, count: ids.length })
}
assert.equal(allIds.size, expectedTotal, 'API/XML coverage differs from DB snapshot')
const samples = []
for (const id of [13448, 28654, 14766, 45938, 78]) {
  const detail = await (await read(`${api}/${id}`)).json()
  assert.equal(detail.id, id)
  assert.ok('region' in detail, 'Region projection not deployed')
  const response = await read(`${preview}/toilet/${id}`)
  const html = await response.text()
  assert.match(response.headers.get('x-robots-tag') || '', /noindex/)
  assert.ok(html.includes(`https://geupddong.com/toilet/${id}`))
  const match = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)
  assert.ok(match, `Missing server JSON-LD for ${id}`)
  const place = JSON.parse(match[1])
  assert.equal(place.name, detail.name)
  assert.equal(place.address?.addressRegion, detail.region?.sidoName || undefined)
  assert.equal(place.address?.addressLocality, detail.region?.sigunguName || undefined)
  const region = regionLabel(detail.region)
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1] || ''
  if (region) assert.ok(title.includes(region), `Missing title region for ${id}`)
  if (id === 78) assert.equal(detail.region, null)
  if (id === 45938) assert.equal(detail.region.sigunguName, null)
  samples.push({ id, region: detail.region, cache: response.headers.get('x-nextjs-cache') })
}
await read(`${api}/sitemap/ids?shard=-1`, 400)
await read(`${api}/sitemap/ids?shard=wrong`, 400)
const robots = await (await read(`${preview}/robots.txt`)).text()
assert.match(robots, /Disallow: \//)
assert.ok(!robots.includes('Sitemap:'))
console.log(JSON.stringify({ passed: true, databaseWrites: 0, expectedTotal, uniqueUrls: allIds.size, shards: summary, samples }, null, 2))
