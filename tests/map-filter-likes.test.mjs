import test from 'node:test'
import assert from 'node:assert/strict'
import { loadMapFilterLikedIds } from '../src/lib/mapFilterLikes.ts'

const page = (ids, page = 0, total = ids.length, size = 2) => ({ items: ids.map(id => ({ id })), page, total, size })
test('private map likes reads every page, including an empty account', async () => {
  const calls = [], pages = [page([1, 2], 0, 3), page([3], 1, 3)]
  assert.deepEqual(await loadMapFilterLikedIds(async index => { calls.push(index); return pages[index] }, new AbortController().signal), [1, 2, 3])
  assert.deepEqual(calls, [0, 1])
  assert.deepEqual(await loadMapFilterLikedIds(async () => page([]), new AbortController().signal), [])
})
test('never returns a partial or duplicated list after concurrent mutations', async () => {
  for (const pages of [[page([1, 2], 0, 3), page([2], 1, 3)], [page([1, 2], 0, 3), page([], 1, 3)], [page([1, 2], 0, 3), page([3], 1, 4)]]) {
    await assert.rejects(loadMapFilterLikedIds(async index => pages[index], new AbortController().signal))
  }
})
test('logout or account switch abort prevents publishing IDs or requesting another page', async () => {
  const controller = new AbortController(), calls = []
  await assert.rejects(loadMapFilterLikedIds(async index => { calls.push(index); controller.abort(); return page([1, 2], 0, 3) }, controller.signal), { name: 'AbortError' })
  assert.deepEqual(calls, [0])
})
test('transport maximum fails immediately without requesting hundreds of pages or returning partial IDs', async () => {
  const calls = []
  await assert.rejects(loadMapFilterLikedIds(async index => { calls.push(index); return page([1, 2], 0, 10_001) }, new AbortController().signal), /not truncated/)
  assert.deepEqual(calls, [0])
})
