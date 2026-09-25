import test from 'node:test'
import assert from 'node:assert/strict'
import { publicToiletResponse } from '../src/lib/publicToiletResponse.ts'

test('public detail JSON retains the contract and leaves freshness to R2', async () => {
  const response = await publicToiletResponse('42', async id => ({ id, name: '공중화장실' }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('set-cookie'), null)
  assert.deepEqual(await response.json(), { id: 42, name: '공중화장실' })
})
test('invalid IDs never reach the shared cache or upstream', async () => {
  for (const id of ['0', '-1', '01', '1.2', '1e3', '9007199254740992', '../1', '']) {
    const response = await publicToiletResponse(id, async () => assert.fail('unexpected lookup'))
    assert.equal(response.status, 400)
  }
})
test('deleted facilities and temporary failures have different uncached responses', async () => {
  assert.equal((await publicToiletResponse('42', async () => null)).status, 404)
  const response = await publicToiletResponse('42', async () => { throw Error('private upstream failure') })
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal((await response.text()).includes('private upstream'), false)
})
