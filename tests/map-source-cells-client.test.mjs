import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchMapSourceCells } from '../src/api/mapSourceCells.ts'

test('source transport sends public coordinates only with no credentials or HTTP cache', async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  const cells = [{ x: 2546, y: 727 }]
  const controller = new AbortController()
  let seen
  globalThis.fetch = async (...args) => { seen = args; return Response.json({ schema: 3, cells: [{ cell: cells[0], toilets: [] }] }) }
  await fetchMapSourceCells(cells, controller.signal)
  assert.equal(seen[0], '/api/map-source-cells')
  assert.equal(seen[1].credentials, 'omit')
  assert.equal(seen[1].cache, 'no-store')
  assert.equal(seen[1].method, 'POST')
  assert.equal(seen[1].signal, controller.signal)
  assert.deepEqual(JSON.parse(seen[1].body), { cells })
})

test('failed or malformed source transport never returns an apparent empty success', async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  for (const makeResponse of [() => new Response(null, { status: 503 }), () => Response.json(null),
    () => Response.json({ schema: 2, cells: [] }), () => Response.json({ schema: 3 })]) {
    globalThis.fetch = async () => makeResponse()
    await assert.rejects(fetchMapSourceCells([{ x: 2546, y: 727 }]))
  }
})
