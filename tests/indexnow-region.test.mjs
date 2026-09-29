import assert from 'node:assert/strict'
import test from 'node:test'
import { canNotifyIndexNowDistricts, changedDistrictIndexNowPaths,
  notifyIndexNowForRegionChanges } from '../src/server/indexNowRegion.ts'
import { regionDirectoryEntries } from '../src/lib/regionDirectory.ts'
import { invalidateRegionMarkers, regionMarkerObjectKey } from '../src/lib/regionMarkerStore.ts'

const district = '11110'
const first = { id: 177, name: '사직주유소', latitude: 37.575, longitude: 126.968,
  translations: { en: { name: 'Sajik Gas Station', roadAddress: '1 Sajik-ro' } } }
const second = { id: 178, name: '공중화장실', latitude: 37.58, longitude: 126.97 }

test('broad or unscoped mutations cannot start an unbounded background region scan', () => {
  assert.equal(canNotifyIndexNowDistricts(null), false)
  assert.equal(canNotifyIndexNowDistricts([]), false)
  assert.equal(canNotifyIndexNowDistricts([district]), true)
  assert.equal(canNotifyIndexNowDistricts(Array.from({ length: 4 }, (_, i) => String(11110 + i))), true)
  assert.equal(canNotifyIndexNowDistricts(Array.from({ length: 5 }, (_, i) => String(11110 + i))), false)
})

test('unchanged rendered directory does not notify for ordering or non-directory marker changes', () => {
  assert.deepEqual(changedDistrictIndexNowPaths(district, [first, second], [
    { ...second, latitude: 37.581, longitude: 126.971 }, first,
  ]), [])
})

test('a translation change also updates traditional-Chinese display fallbacks', () => {
  const paths = changedDistrictIndexNowPaths(district, [first], [{ ...first,
    translations: { en: { name: 'Sajik Service Station', roadAddress: '1 Sajik-ro' } },
  }])
  assert.equal(paths.length, 3)
  assert.ok(paths.some(path => /^\/en\/regions\/seoul-11\/jongno-gu-11110$/.test(path)))
  assert.ok(paths.some(path => path.startsWith('/zh-tw/regions/')))
  assert.ok(paths.some(path => path.startsWith('/zh-hk/regions/')))
})

test('addition and removal notify every language, not other regions', () => {
  for (const [before, after] of [[[], [first]], [[first], []]]) {
    const paths = changedDistrictIndexNowPaths(district, before, after)
    assert.equal(paths.length, 6)
    assert.ok(paths.every(path => path.startsWith('/regions/') || /^\/(en|ja|zh-cn|zh-tw|zh-hk)\/regions\//.test(path)))
    assert.ok(paths.every(path => path.includes('11110')))
  }
})

test('Korean rename leaves an independently translated English directory untouched', () => {
  const paths = changedDistrictIndexNowPaths(district, [first], [{ ...first, name: '새 이름' }])
  assert.equal(paths.length, 5)
  assert.ok(!paths.some(path => path.startsWith('/en/')))
})

test('projection uses the exact localized name and canonical link rendered by the district page', () => {
  const [entry] = regionDirectoryEntries([first], 'en', district)
  assert.equal(entry.name, 'Sajik Gas Station')
  assert.match(entry.href, /^\/en\/regions\/seoul-11\/jongno-gu-11110\/toilet\/177-/)
  assert.throws(() => changedDistrictIndexNowPaths('00000', [], []), /Unknown district/)
})

test('invalidation captures only the fresh district before-image it already reads', async () => {
  const objects = new Map([[regionMarkerObjectKey(district), { etag: 'one', value: JSON.stringify({
    schema: 1, districtCode: district, revision: 1, globalRevision: 0,
    state: 'data', storedAt: Date.now(), data: [first],
  }) }]])
  let sequence = 1
  const bucket = {
    get: async key => objects.has(key) ? { etag: objects.get(key).etag,
      json: async () => JSON.parse(objects.get(key).value) } : null,
    put: async (key, value, options) => {
      if (options?.onlyIf?.etagMatches && objects.get(key)?.etag !== options.onlyIf.etagMatches) return null
      const stored = { etag: `etag-${++sequence}`, value }; objects.set(key, stored); return stored
    },
  }
  const snapshots = new Map()
  await invalidateRegionMarkers(bucket, [district, '11140'], Date.now,
    (code, markers) => snapshots.set(code, markers))
  assert.deepEqual(snapshots.get(district), [first])
  assert.equal(snapshots.has('11140'), false)
})

test('a signed-region before-image yields only changed canonical district URLs', async () => {
  const requests = []
  const result = await notifyIndexNowForRegionChanges(new Map([[district, [first]]]),
    async () => [{ ...first, name: '새 이름' }], async (url, init) => {
      requests.push({ url: String(url), init })
      return new Response('', { status: 202 })
    })
  assert.deepEqual(result, { submitted: 5, status: 202 })
  const urls = JSON.parse(requests[0].init.body).urlList
  assert.ok(urls.every(url => new URL(url).pathname.includes('/regions/')))
  assert.ok(!urls.some(url => new URL(url).pathname.startsWith('/en/')))
})

test('an unavailable refreshed district is skipped, never treated as empty', async () => {
  let requests = 0
  const original = console.error
  console.error = () => {}
  try {
    const result = await notifyIndexNowForRegionChanges(new Map([[district, [first]]]),
      async () => { throw new Error('origin unavailable') }, async () => { requests++; throw new Error('unexpected') })
    assert.deepEqual(result, { submitted: 0, status: null })
    assert.equal(requests, 0)
  } finally { console.error = original }
})

test('regional submission uses the bounded retry path after a transient IndexNow failure', async () => {
  let attempts = 0
  const result = await notifyIndexNowForRegionChanges(new Map([[district, [first]]]),
    async () => [], async () => new Response('', { status: ++attempts === 1 ? 503 : 202 }))
  assert.deepEqual(result, { submitted: 6, status: 202 })
  assert.equal(attempts, 2)
})
