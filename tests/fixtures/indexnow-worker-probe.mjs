// Local integration harness only. Never packaged in a release or deployed.
let detailReads = 0, submissions = 0, submittedPaths = []
const counts = { maleToiletCount: 1, maleUrinalCount: 1, maleDisabledToiletCount: 0, maleDisabledUrinalCount: 0,
  maleChildToiletCount: 0, maleChildUrinalCount: 0, femaleToiletCount: 1, femaleDisabledToiletCount: 0, femaleChildToiletCount: 0 }
const detail = { id: 177, name: '검증 변경 화장실', roadAddress: '서울특별시 종로구',
  latitude: 37.575, longitude: 126.968, ...counts }
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.hostname === 'api.geupddong.com' && url.pathname === '/api/v1/toilets/177') {
    detailReads++; return Response.json(detail)
  }
  if (url.hostname === 'api.indexnow.org' && url.pathname === '/indexnow') {
    submissions++
    const payload = JSON.parse(init?.body ?? await input.clone().text())
    submittedPaths = payload.urlList.map(value => decodeURI(new URL(value).pathname))
    return new Response('{}', { status: 202 })
  }
  throw new Error('External network is prohibited in this isolated Worker proof')
}
export default { async fetch(request, env, ctx) {
  const url = new URL(request.url)
  if (url.pathname !== '/__local-indexnow-proof') return handler.fetch(request, env, ctx)
  if (url.hostname !== '127.0.0.1' || request.headers.get('x-local-proof') !== env.CACHE_REVALIDATION_SECRET)
    return new Response(null, { status: 404 })
  const bucket = env.PUBLIC_TOILET_DATA_CACHE_R2, key = 'public-toilets/v1/toilets/177.json'
  if (request.method === 'POST') {
    const now = Date.now()
    await bucket.put(key, JSON.stringify({ schema: 1, toiletId: 177, revision: 1, state: 'data', storedAt: now,
      freshUntil: now + 86_400_000, staleUntil: now + 2 * 86_400_000,
      data: { ...detail, name: '검증 이전 화장실' } }))
    return Response.json({ seeded: true })
  }
  if (request.method === 'PUT') {
    const waits = []
    handler.scheduled({ cron: '*/10 * * * *' }, env, { ...ctx, waitUntil: promise => waits.push(promise) })
    await Promise.all(waits)
  }
  const jobs = []
  let cursor
  do {
    const page = await bucket.list({ prefix: 'indexnow/outbox/v1/', cursor })
    for (const { key } of page.objects) jobs.push(await (await bucket.get(key)).json())
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  const source = await (await bucket.get(key)).json()
  return Response.json({ detailReads, submissions, submittedPaths, jobs, cacheState: source.state })
} }
