import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { placeSearchResponse } from '../place-search-worker.mjs'
import { resolvePreviewCoordinateCorrections } from '../scripts/place-search-coordinate-corrections.mjs'

const root = new URL('../', import.meta.url)
const [metadata, ...rows] = (await readFile(new URL('data/place-search/place-search-seed-20260920.ndjson', root), 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line))
const seed = { ...metadata, records: rows.map(({ type: _type, ...record }) => record) }
const correctionConfig = JSON.parse(await readFile(new URL('data/place-search/preview-coordinate-corrections-20260921.json', root), 'utf8'))
const corrections = resolvePreviewCoordinateCorrections(metadata, seed.records, correctionConfig)

test('keeps all audited records while exposing only preview-usable places', () => {
  assert.equal(seed.records.length, 2000)
  assert.deepEqual(seed.counts, { usable_preview: 1923, pending_review: 66, excluded: 11 })
  assert.equal(seed.records.filter(place => place.searchScope === 'preview').length, 1923)
  assert.equal(seed.records.filter(place => place.searchScope === 'disabled').length, 77)
  assert.equal(seed.records.some(place => place.productionApproved), false)
  assert.equal(seed.records.every(place => place.categoryCode && place.categoryLabelKo && place.categoryLabelEn), true)
  assert.deepEqual(seed.records.find(place => place.id === 'Q490915') && {
    name: seed.records.find(place => place.id === 'Q490915').nameEn,
    category: seed.records.find(place => place.id === 'Q490915').categoryLabelEn,
    scope: seed.records.find(place => place.id === 'Q490915').searchScope,
  }, { name: 'Magok Station', category: 'Station', scope: 'preview' })
  assert.equal(seed.records.find(place => place.id === 'Q20415')?.searchScope, 'preview')
  assert.equal(corrections.size, 20)
  assert.ok(corrections.has('Q20823454'))
  assert.ok(corrections.has('Q69073'))
  assert.equal(corrections.get('Q20823464').evidence.matchedSourceName, '서구청')
  assert.throws(() => resolvePreviewCoordinateCorrections(metadata, seed.records,
    { ...correctionConfig, sourceSeedHash: 'stale' }), /Invalid preview coordinate correction source/)
  assert.throws(() => resolvePreviewCoordinateCorrections(metadata, seed.records,
    { ...correctionConfig, entries: correctionConfig.entries.map(entry => entry.id === 'Q20823454'
      ? { ...entry, latitude: 35.230154, longitude: 127.368207 } : entry) }), /Invalid preview coordinate correction target/)
})

test('generated D1 schema and import are executable and searchable', async () => {
  const database = new DatabaseSync(':memory:')
  database.exec(await readFile(new URL('db/place-search-schema.sql', root), 'utf8'))
  database.exec(await readFile(new URL('.generated/place-search-import.sql', root), 'utf8'))

  assert.equal(database.prepare('SELECT count(*) AS count FROM places').get().count, 2000)
  assert.equal(database.prepare('SELECT count(*) AS count FROM place_search_fts').get().count, 1923)
  assert.equal(database.prepare('SELECT count(*) AS count FROM place_search_localized_fts').get().count, 1923 * 4)
  assert.equal(database.prepare('SELECT count(*) AS count FROM place_localizations').get().count, 1923 * 4 - 33)
  assert.equal(database.prepare("SELECT count(*) AS count FROM place_localizations WHERE source_language='en'").get().count, 503)
  assert.equal(database.prepare("SELECT count(*) AS count FROM places WHERE search_scope='production'").get().count, 0)
  assert.deepEqual(database.prepare(`SELECT latitude, longitude, count(*) AS count FROM places
    WHERE search_scope = 'preview' GROUP BY latitude, longitude HAVING count(*) > 3`).all(), [])
  const correctedStation = database.prepare("SELECT status, search_scope, latitude, longitude, audit_json FROM places WHERE id='Q20823454'").get()
  assert.equal(correctedStation.status, 'usable_preview')
  assert.equal(correctedStation.search_scope, 'preview')
  assert.equal(correctedStation.latitude, 37.594905)
  assert.equal(correctedStation.longitude, 126.6278076)
  assert.equal(JSON.parse(correctedStation.audit_json).previewCoordinateCorrection.sourceRow, 35)
  const renamedStationAudit = JSON.parse(database.prepare("SELECT audit_json FROM places WHERE id='Q20823464'").get().audit_json)
  assert.equal(renamedStationAudit.officialLocalizationOverrides.length, 4)
  assert.equal(database.prepare("SELECT name FROM place_localizations WHERE place_id='Q20823464' AND locale='ja'").get().name,
    'ソヘグチョン駅')
  assert.equal(database.prepare("SELECT name FROM place_localizations WHERE place_id='Q20823464' AND locale='zh-CN'").get().name,
    '西海区厅站')
  assert.equal(database.prepare("SELECT source_revision FROM place_localizations WHERE place_id='Q20823464' AND locale='ja'").get().source_revision,
    null)
  const result = database.prepare(`
    SELECT p.name_en
    FROM place_search_fts
    JOIN places p ON p.id = place_search_fts.place_id
    WHERE place_search_fts MATCH ? AND p.search_scope = 'preview'
    LIMIT 5
  `).all('"incheon"* AND "airport"*')
  assert.ok(result.some(place => place.name_en === 'Incheon International Airport'))
  const myeongdong = database.prepare(`
    SELECT p.id, p.name_en, p.audit_json
    FROM place_search_fts
    JOIN places p ON p.id = place_search_fts.place_id
    WHERE place_search_fts MATCH ? AND p.search_scope = 'preview'
    LIMIT 5
  `).all('"myeongdong"*')
  assert.ok(myeongdong.some(place => place.id === 'Q626260' && place.name_en === 'Myeong-dong Station'
    && JSON.parse(place.audit_json).curatedAliasSource.includes('english.seoul.go.kr')))
  for (const [locale, query, name] of [
    ['ja', '"ソウル"*', 'ソウル駅'],
    ['zh-CN', '"首尔"*', '首尔站'],
    ['zh-TW', '"首爾"*', '首爾站'],
    ['zh-HK', '"首爾"*', '首爾站'],
  ]) {
    const localized = database.prepare(`
      SELECT f.place_id, l.name FROM place_search_localized_fts f
      JOIN place_localizations l ON l.place_id = f.place_id AND l.locale = f.locale
      WHERE place_search_localized_fts MATCH ? AND f.locale = ? AND f.place_id = 'Q20415'
    `).all(query, locale)
    assert.deepEqual(localized.map(row => ({ place_id: row.place_id, name: row.name })), [{ place_id: 'Q20415', name }])
  }
  const busan = database.prepare("SELECT name, source_language FROM place_localizations WHERE place_id='Q53118' AND locale='zh-CN'").get()
  assert.equal(busan.name, '釜山站')
  assert.equal(busan.source_language, 'zh')
  const translated = database.prepare("SELECT name, source_language FROM place_localizations WHERE place_id='Q15464762' AND locale='zh-CN'").get()
  assert.equal(translated.name, '釜山国际金融中心')
  assert.equal(translated.source_language, 'en')
  assert.equal(database.prepare("SELECT count(*) AS count FROM place_localizations WHERE place_id='Q625749' AND locale='zh-CN'").get().count, 0)
  assert.equal(database.prepare("SELECT count(*) AS count FROM place_localizations WHERE place_id='Q625763'").get().count, 0)
  const d1 = { prepare(statement) { return { bind(...values) { return { async all() {
    return { results: database.prepare(statement).all(...values) }
  } } } } } }
  for (const [locale, query, name] of [
    ['en', 'Seoul Station', 'Seoul Station'],
    ['ja', 'ソウル', 'ソウル駅'],
    ['zh-CN', '首尔', '首尔站'],
    ['zh-TW', '首爾', '首爾站'],
    ['zh-HK', '首爾', '首爾站'],
  ]) {
    const response = await placeSearchResponse(new Request('https://example.com/api/place-search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale, query }),
    }), { PLACE_SEARCH_ENABLED: 'true', PLACE_SEARCH_SCOPE: 'preview', PLACE_SEARCH_D1: d1 })
    assert.equal(response.status, 200, locale)
    assert.ok((await response.json()).results.some(result => result.id === 'Q20415' && result.name === name), locale)
  }
  const machineResult = await placeSearchResponse(new Request('https://example.com/api/place-search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale: 'zh-CN', query: '釜山国际' }),
  }), { PLACE_SEARCH_ENABLED: 'true', PLACE_SEARCH_SCOPE: 'preview', PLACE_SEARCH_D1: d1 })
  assert.equal(machineResult.status, 200)
  assert.ok((await machineResult.json()).results.some(result => result.id === 'Q15464762' && result.name === '釜山国际金融中心'))
  const correctedResult = await placeSearchResponse(new Request('https://example.com/api/place-search', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale: 'en', query: 'Geomdan Oryu' }),
  }), { PLACE_SEARCH_ENABLED: 'true', PLACE_SEARCH_SCOPE: 'preview', PLACE_SEARCH_D1: d1 })
  assert.equal(correctedResult.status, 200)
  assert.ok((await correctedResult.json()).results.some(result => result.id === 'Q20823454'
    && result.latitude === 37.594905 && result.longitude === 126.6278076))
  database.close()
})

test('component imports add the second dataset without replacing the first', async () => {
  const base = 'wikidata-place-seed-20260920'
  const extension = 'wikidata-place-extension-20260920'
  for (const id of [base, extension]) {
    execFileSync(process.execPath, [fileURLToPath(new URL('scripts/build-place-search-import.mjs', root)),
      '--component', id, '--output', fileURLToPath(new URL(`.generated/${id}-import.sql`, root))])
  }
  const database = new DatabaseSync(':memory:')
  database.exec(await readFile(new URL('db/place-search-schema.sql', root), 'utf8'))
  database.exec(await readFile(new URL(`.generated/${base}-import.sql`, root), 'utf8'))
  const original = database.prepare('SELECT source_hash, imported_at FROM source_datasets WHERE id = ?').get(base)
  database.exec(await readFile(new URL(`.generated/${extension}-import.sql`, root), 'utf8'))
  assert.deepEqual(database.prepare('SELECT source_hash, imported_at FROM source_datasets WHERE id = ?').get(base), original)
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM places').get().count, 2000)
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM place_search_fts').get().count, 1923)
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM place_search_localized_fts').get().count, 1923 * 4)
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM places WHERE production_approved = 1').get().count, 0)
  database.close()
})

test('coordinate delta restores only the 20 suppressed preview stations and is repeatable', async () => {
  execFileSync(process.execPath, [fileURLToPath(new URL('scripts/build-place-search-coordinate-correction-delta.mjs', root))])
  const database = new DatabaseSync(':memory:')
  database.exec(await readFile(new URL('db/place-search-schema.sql', root), 'utf8'))
  database.exec(await readFile(new URL('.generated/place-search-import.sql', root), 'utf8'))
  const old = correctionConfig.previousCoordinate
  for (const id of corrections.keys()) {
    database.prepare(`UPDATE places SET status='pending_review', search_scope='disabled',
      latitude=?, longitude=? WHERE id=?`).run(old.latitude, old.longitude, id)
    database.prepare('DELETE FROM place_search_fts WHERE place_id=?').run(id)
    database.prepare('DELETE FROM place_search_localized_fts WHERE place_id=?').run(id)
    database.prepare('DELETE FROM place_localizations WHERE place_id=?').run(id)
  }
  assert.equal(database.prepare("SELECT count(*) AS count FROM places WHERE search_scope='disabled'").get().count, 97)
  const delta = await readFile(new URL('.generated/place-search-coordinate-correction-delta.sql', root), 'utf8')
  database.exec(delta)
  database.exec(delta)
  assert.equal(database.prepare("SELECT count(*) AS count FROM places WHERE search_scope='disabled'").get().count, 77)
  assert.equal(database.prepare('SELECT count(*) AS count FROM place_search_fts').get().count, 1923)
  assert.equal(database.prepare('SELECT count(*) AS count FROM place_search_localized_fts').get().count, 1923 * 4)
  assert.equal(database.prepare('SELECT count(*) AS count FROM place_localizations').get().count, 1923 * 4 - 33)
  const renamedStation = database.prepare("SELECT latitude, longitude FROM places WHERE id='Q20823464'").get()
  assert.equal(renamedStation.latitude, 37.5440329)
  assert.equal(renamedStation.longitude, 126.6769945)
  database.close()
})
