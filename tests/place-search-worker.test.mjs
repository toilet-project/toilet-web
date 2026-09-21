import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEnglishFtsQuery, buildLocalizedFtsQuery, placeSearchResponse, normalizeEnglishSearchQuery, normalizeLocalizedSearchQuery } from '../place-search-worker.mjs'

test('normalizes English queries and builds prefix terms', () => {
  assert.equal(normalizeEnglishSearchQuery('  Séoul—Station! '), 'seoul station')
  assert.equal(buildEnglishFtsQuery('Seoul Station'), '"seoul"* AND "station"*')
})

test('preserves Japanese dakuten and Chinese characters in localized prefix terms', () => {
  assert.equal(normalizeLocalizedSearchQuery('  ガンナム 駅! '), 'ガンナム 駅')
  assert.equal(buildLocalizedFtsQuery('首尔站'), '"首尔站"*')
})

test('ignores routes outside the English place search endpoint', async () => {
  const response = await placeSearchResponse(new Request('https://example.com/'), {})
  assert.equal(response, null)
})

test('rejects non-English use without querying D1', async () => {
  let prepared = false
  const response = await placeSearchResponse(new Request('https://example.com/api/place-search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: 'ko', query: 'seoul' }),
  }), {
    PLACE_SEARCH_ENABLED: 'true',
    PLACE_SEARCH_D1: { prepare() { prepared = true } },
  })
  assert.equal(response.status, 400)
  assert.equal(prepared, false)
})

test('returns ranked English place results from the preview scope', async () => {
  let bindings
  const database = {
    prepare(statement) {
      assert.match(statement, /place_search_fts MATCH/)
      return {
        bind(...values) {
          bindings = values
          return {
            async all() {
              return { results: [{
                id: 'Q8684', name_en: 'Seoul', name_ko: '서울특별시', region_en: 'Seoul',
                category_code: 'city', category_label_en: 'City',
                latitude: 37.5667, longitude: 126.9783,
              }] }
            },
          }
        },
      }
    },
  }
  const response = await placeSearchResponse(new Request('https://example.com/api/place-search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: 'en', query: 'Seoul' }),
  }), {
    PLACE_SEARCH_ENABLED: 'true', PLACE_SEARCH_SCOPE: 'preview', PLACE_SEARCH_D1: database,
  })
  assert.equal(response.status, 200)
  assert.deepEqual(bindings, ['seoul', 'seoul%', '"seoul"*', 'preview'])
  assert.deepEqual(await response.json(), { results: [{
    id: 'Q8684', name: 'Seoul', address: 'Seoul, South Korea', categoryCode: 'city', category: 'City', latitude: 37.5667, longitude: 126.9783,
  }] })
})

test('uses the requested locale index and returns its exact translated name', async () => {
  let bindings
  const response = await placeSearchResponse(new Request('https://example.com/api/place-search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: 'ja', query: 'ソウル' }),
  }), {
    PLACE_SEARCH_ENABLED: 'true', PLACE_SEARCH_SCOPE: 'preview',
    PLACE_SEARCH_D1: { prepare(statement) {
      assert.match(statement, /place_search_localized_fts MATCH/)
      return { bind(...values) { bindings = values; return { async all() { return { results: [{
        id: 'Q20415', name_en: 'Seoul Station', localized_name: 'ソウル駅', region_en: 'Seoul',
        category_code: 'station', category_label_en: 'Station', latitude: 37.55, longitude: 126.97,
      }] } } } } }
    } },
  })
  assert.deepEqual(bindings, ['ソウル', 'ソウル%', '"ソウル"*', 'ja', 'preview'])
  assert.equal((await response.json()).results[0].name, 'ソウル駅')
})

test('fails closed when the English search binding is disabled', async () => {
  const response = await placeSearchResponse(new Request('https://example.com/api/place-search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: 'en', query: 'Seoul' }),
  }), {})
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('fails closed when the search scope is absent or invalid', async () => {
  for (const scope of [undefined, 'other']) {
    let prepared = false
    const response = await placeSearchResponse(new Request('https://example.com/api/place-search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'en', query: 'Seoul' }),
    }), { PLACE_SEARCH_ENABLED: 'true', PLACE_SEARCH_SCOPE: scope,
      PLACE_SEARCH_D1: { prepare() { prepared = true } } })
    assert.equal(response.status, 503)
    assert.equal(prepared, false)
  }
})

test('requires approved rows in the production scope for every language', async () => {
  for (const locale of ['en', 'ja']) {
    let statement
    let bindings
    const response = await placeSearchResponse(new Request('https://example.com/api/place-search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale, query: 'Seoul' }),
    }), { PLACE_SEARCH_ENABLED: 'true', PLACE_SEARCH_SCOPE: 'production',
      PLACE_SEARCH_D1: { prepare(value) { statement = value; return {
        bind(...values) { bindings = values; return { async all() { return { results: [] } } } },
      } } } })
    assert.equal(response.status, 200)
    assert.match(statement, /p\.production_approved = 1/)
    assert.equal(bindings.at(-1), 'production')
  }
})
