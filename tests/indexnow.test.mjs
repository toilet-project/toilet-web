import assert from 'node:assert/strict'
import test from 'node:test'
import {
  INDEXNOW_ENDPOINT, INDEXNOW_KEY, INDEXNOW_KEY_PATH, buildIndexNowPayload, canonicalIndexNowPaths,
  indexNowUrls, notifyIndexNowForEvents, submitIndexNow,
} from '../src/server/indexNow.ts'

const detail = {
  id: 177, name: '사직주유소', roadAddress: '서울 종로구 사직로 1', jibunAddress: null,
  latitude: 37.575, longitude: 126.968,
  translations: {
    en: { name: 'Sajik Gas Station', roadAddress: '1 Sajik-ro, Jongno-gu, Seoul' },
    ja: { name: 'サジク給油所', roadAddress: 'ソウル鍾路区サジクロ1' },
    'zh-CN': { name: '社稷加油站', roadAddress: '首尔钟路区社稷路1号' },
  },
}

test('payload contains only same-origin public detail URLs and deduplicates them', () => {
  const paths = ['/toilet/177', '/toilet/177', '/en/toilet/177', '/api/v1/toilets/177',
    '/admin/toilets/177', '/login', '/toilet/177?preview=1', '//evil.example/toilet/177']
  assert.deepEqual(indexNowUrls(paths), [
    'https://geupddong.com/toilet/177', 'https://geupddong.com/en/toilet/177',
  ])
  assert.deepEqual(buildIndexNowPayload(paths), {
    host: 'geupddong.com', key: INDEXNOW_KEY,
    keyLocation: `https://geupddong.com${INDEXNOW_KEY_PATH}`,
    urlList: ['https://geupddong.com/toilet/177', 'https://geupddong.com/en/toilet/177'],
  })
  assert.equal(buildIndexNowPayload(['/api/private']), null)
})

test('canonical paths include only locales with complete current translations', () => {
  const paths = canonicalIndexNowPaths(detail)
  assert.equal(paths.length, 4)
  assert.ok(paths[0].startsWith('/regions/서울특별시-11/종로구-11110/toilet/177-'))
  assert.ok(paths[1].startsWith('/en/regions/seoul-11/jongno-gu-11110/toilet/177-'))
  assert.ok(paths[2].startsWith('/ja/regions/ソウル-11/鍾路区-11110/toilet/177-'))
  assert.ok(paths[3].startsWith('/zh-cn/regions/首尔-11/钟路区-11110/toilet/177-'))
  assert.ok(paths.every(path => !path.startsWith('/zh-tw') && !path.startsWith('/zh-hk')))
})

test('submission retries transient failures and never sends rejected paths', async () => {
  const requests = []
  const statuses = [503, 202]
  const fetchImpl = async (url, init) => {
    requests.push({ url, init })
    return new Response('', { status: statuses.shift() })
  }
  const result = await submitIndexNow(['/toilet/177', '/_internal/cache/revalidate'], fetchImpl, async () => {})
  assert.deepEqual(result, { submitted: 1, status: 202 })
  assert.equal(requests.length, 2)
  assert.equal(requests[0].url, INDEXNOW_ENDPOINT)
  assert.deepEqual(JSON.parse(requests[0].init.body).urlList, ['https://geupddong.com/toilet/177'])
})

test('UPSERT resolves canonical paths while DELETE submits stable removal aliases', async () => {
  const requests = []
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url: String(url), init })
    if (String(url).includes('/api/v1/toilets/177')) return Response.json(detail)
    return new Response('', { status: 202 })
  }
  const result = await notifyIndexNowForEvents([
    { toiletId: 177, revision: 2, action: 'UPSERT', catalogChanged: true },
    { toiletId: 178, revision: 3, action: 'DELETE', catalogChanged: true },
  ], fetchImpl)
  assert.deepEqual(result, { submitted: 10, status: 202 })
  const payload = JSON.parse(requests.at(-1).init.body)
  assert.equal(payload.urlList.length, 10)
  assert.ok(payload.urlList.some(url => url.includes('/en/regions/')))
  assert.ok(payload.urlList.includes('https://geupddong.com/zh-hk/toilet/178'))
})

test('one unavailable UPSERT does not suppress another event in the signed batch', async () => {
  const requests = []
  const originalError = console.error
  console.error = () => {}
  try {
    const fetchImpl = async (url, init = {}) => {
      requests.push({ url: String(url), init })
      if (String(url).includes('/api/v1/toilets/177')) return new Response('', { status: 503 })
      return new Response('', { status: 202 })
    }
    const result = await notifyIndexNowForEvents([
      { toiletId: 177, revision: 2, action: 'UPSERT', catalogChanged: false },
      { toiletId: 178, revision: 3, action: 'PRIVATE', catalogChanged: true },
    ], fetchImpl)
    assert.deepEqual(result, { submitted: 6, status: 202 })
    assert.equal(requests.filter(request => request.url === INDEXNOW_ENDPOINT).length, 1)
  } finally {
    console.error = originalError
  }
})
