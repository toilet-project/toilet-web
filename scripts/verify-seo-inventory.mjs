// Validate every published URL without requesting each detail page.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { parseLocalizedPublicPath, localizedPublicPath } from '../src/i18n/routes.ts'
import { SUPPORTED_LOCALES } from '../src/i18n/locale.ts'
import { getProvince, getDistrict, localizedRegionPath } from '../src/lib/regions.ts'
import { codeFromRegionSegment } from '../src/lib/urlName.ts'
import { parseRegionToiletSegment } from '../src/lib/regionToiletPath.ts'

const urls = JSON.parse(await readFile(process.argv[2], 'utf8'))
assert.equal(new Set(urls).size, urls.length, 'Duplicate sitemap URLs')
const ids = Object.fromEntries(SUPPORTED_LOCALES.map(locale => [locale, new Set()]))
const counts = Object.fromEntries(SUPPORTED_LOCALES.map(locale => [locale, { pages: 0, facilities: 0 }]))
for (const url of urls) {
  const target = new URL(url), route = parseLocalizedPublicPath(target.pathname)
  assert.equal(target.origin, 'https://geupddong.com')
  assert.ok(route && !route.suffix, `Unrecognized route: ${url}`)
  assert.equal(target.search + target.hash, '')
  const parts = route.path.split('/').filter(Boolean)
  let id
  if (parts[0] === 'regions' && parts[1]) {
    const province = codeFromRegionSegment(parts[1], 2)
    const district = parts[2] ? codeFromRegionSegment(parts[2], 5) : undefined
    assert.ok(getProvince(province), url)
    if (district) assert.ok(getDistrict(province, district), url)
    assert.equal(`/regions/${parts.slice(1, district ? 3 : 2).join('/')}`, localizedRegionPath(route.locale, province, district), `Stale region name: ${url}`)
    if (parts[3] === 'toilet') id = parseRegionToiletSegment(parts[4])
  } else if (parts[0] === 'toilet') id = Number(parts[1])
  assert.equal(localizedPublicPath(route.path, route.locale), decodeURI(target.pathname), url)
  counts[route.locale].pages++
  if (id !== undefined) {
    assert.ok(Number.isSafeInteger(id) && id > 0, url)
    assert.ok(!ids[route.locale].has(id), `Multiple canonical URLs for facility ${id} (${route.locale})`)
    ids[route.locale].add(id)
    counts[route.locale].facilities++
  }
}
for (const locale of SUPPORTED_LOCALES.filter(l => l !== 'ko')) {
  for (const id of ids[locale]) assert.ok(ids.ko.has(id), `Localized facility ${id} lacks a Korean counterpart`)
}
console.log(JSON.stringify({ passed: true, checkedUrls: urls.length, counts }, null, 2))
