import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

const root = new URL('../', import.meta.url)
const [metadata, ...rows] = (await readFile(new URL('data/place-search/place-search-seed-20260920.ndjson', root), 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line))
const seed = { ...metadata, records: rows.map(({ type: _type, ...record }) => record) }

test('keeps all audited records while exposing only preview-usable places', () => {
  assert.equal(seed.records.length, 1000)
  assert.deepEqual(seed.counts, { usable_preview: 595, pending_review: 401, excluded: 4 })
  assert.equal(seed.records.filter(place => place.searchScope === 'preview').length, 595)
  assert.equal(seed.records.filter(place => place.searchScope === 'disabled').length, 405)
  assert.equal(seed.records.some(place => place.productionApproved), false)
})

test('generated D1 schema and import are executable and searchable', async () => {
  const database = new DatabaseSync(':memory:')
  database.exec(await readFile(new URL('db/place-search-schema.sql', root), 'utf8'))
  database.exec(await readFile(new URL('.generated/place-search-import.sql', root), 'utf8'))

  assert.equal(database.prepare('SELECT count(*) AS count FROM places').get().count, 1000)
  assert.equal(database.prepare('SELECT count(*) AS count FROM place_search_fts').get().count, 595)
  assert.equal(database.prepare("SELECT count(*) AS count FROM places WHERE search_scope='production'").get().count, 0)
  const result = database.prepare(`
    SELECT p.name_en
    FROM place_search_fts
    JOIN places p ON p.id = place_search_fts.place_id
    WHERE place_search_fts MATCH ? AND p.search_scope = 'preview'
    LIMIT 5
  `).all('"incheon"* AND "airport"*')
  assert.ok(result.some(place => place.name_en === 'Incheon International Airport'))
  database.close()
})
