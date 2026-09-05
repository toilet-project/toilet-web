// Isolated Node production smoke. No production DB writes, real OAuth, or Cloudflare deployment.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import {signatureFor, REVALIDATION_PATH} from '../src/server/cacheRevalidation.ts'

const counts = new Map()
const secret = 'test-only-signing-secret-at-least-32-bytes'
let deleted = false
const fixture = { id: 900001, name: '검증용 화장실', toiletType: '공중화장실', latitude: 36.85, longitude: 127.15,
  roadAddress: '충청남도 천안시 서북구 검증로 1', jibunAddress: '', openTime: '상시', openTimeDetail: '',
  region: { sidoName: '충청남도', sidoCode: '44', sigunguName: '천안시 서북구', sigunguCode: '44133', cityName: '천안시', districtName: '서북구' },
  maleToiletCount: 3, femaleToiletCount: 5, hasEmergencyBell: 'Y', hasCctv: 'N', hasDiaperTable: 'N' }
const api = createServer((req,res) => {
  counts.set(req.url,(counts.get(req.url) || 0)+1)
  res.setHeader('Content-Type','application/json')
  if (req.url === '/api/v1/toilets/900001' && !deleted) return res.end(JSON.stringify(fixture))
  if (req.url === '/api/v1/toilets/900002') return res.end(JSON.stringify({...fixture,id:900002,latitude:null,longitude:null,roadAddress:'',jibunAddress:'충청남도 천안시 서북구 검증동 1',region:null}))
  res.statusCode = req.url === '/api/v1/toilets/900500' ? 503 : 404
  res.end('{}')
})
api.listen(0,'127.0.0.1')
await once(api,'listening')
const apiPort = api.address().port
const reservation = createServer().listen(0,'127.0.0.1')
await once(reservation,'listening')
const port = reservation.address().port
await new Promise(resolve=>reservation.close(resolve))
const env = {...process.env, CACHE_RUNTIME:'node', CACHE_REVALIDATION_SECRET:secret, NEXT_BUILD_DIR:'.next-smoke', TOILET_API_ORIGIN:`http://127.0.0.1:${apiPort}`, SITE_INDEXABLE:'false', NEXT_TELEMETRY_DISABLED:'1', NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY:'smoke-public-key'}
let server
let output = ''
const run = args => {
  const child = spawn(process.execPath,['node_modules/next/dist/bin/next',...args],{env,stdio:['ignore','pipe','pipe'],windowsHide:true})
  child.stdout.on('data',data=>{ output+=data; if(args[0]==='build') process.stdout.write(data) })
  child.stderr.on('data',data=>{output+=data})
  return child
}
try {
  const build = run(['build'])
  const [code] = await once(build,'exit')
  assert.equal(code,0,output)
  assert.equal(counts.size,0,'build must not crawl/prebuild toilet data')
  server = run(['start','-p',String(port),'-H','127.0.0.1'])
  const origin = `http://127.0.0.1:${port}`
  for(let attempt=0;attempt<100;attempt++) {
    try { if((await fetch(origin)).ok) break } catch { /* wait for local startup */ }
    if(attempt===99) throw new Error(output)
    await delay(100)
  }
  const first = await fetch(`${origin}/toilet/900001`)
  const html = await first.text()
  assert.equal(first.status,200)
  assert.match(html,/<h1[^>]*>검증용 화장실<\/h1>/)
  assert.match(html,/충청남도 천안시 서북구 검증로 1/)
  assert.match(html,/충청남도 천안시 서북구/)
  assert.match(html,/화장실 수/)
  assert.match(html,/href="https:\/\/geupddong.com\/toilet\/900001"/)
  assert.match(first.headers.get('x-robots-tag'),/noindex/)
  for(let i=0;i<3;i++) {
    const cached = await fetch(`${origin}/toilet/900001`)
    await cached.text()
    assert.equal(cached.status,200)
    assert.equal(cached.headers.get('x-nextjs-cache'),'HIT')
  }
  assert.equal(counts.get('/api/v1/toilets/900001'),1,'metadata + page + cache HIT must share a single upstream request')
  const invalidate = async(valid=true) => {
    const body=JSON.stringify({toiletIds:[900001]})
    const timestamp=String(Math.floor(Date.now()/1000))
    return fetch(`${origin}${REVALIDATION_PATH}`,{method:'POST',headers:{'content-type':'application/json','x-cache-timestamp':timestamp,'x-cache-signature':valid?signatureFor(secret,timestamp,body):'0'.repeat(64)},body})
  }
  fixture.name='변경된 화장실'
  fixture.openTime='09:00~18:00'
  fixture.region={sidoName:'세종특별자치시',sidoCode:'36',sigunguName:null}
  assert.equal((await invalidate(false)).status,401)
  assert.match(await (await fetch(`${origin}/toilet/900001`)).text(),/<h1[^>]*>검증용 화장실<\/h1>/)
  assert.equal(counts.get('/api/v1/toilets/900001'),1,'forged request must not evict cache')
  assert.equal((await invalidate()).status,200)
  const changed=await (await fetch(`${origin}/toilet/900001`)).text()
  assert.match(changed,/<h1[^>]*>변경된 화장실<\/h1>/)
  assert.match(changed,/세종특별자치시/)
  assert.match(changed,/09:00~18:00/)
  assert.equal(counts.get('/api/v1/toilets/900001'),2)
  fixture.region=null
  assert.equal((await invalidate()).status,200)
  assert.doesNotMatch(await (await fetch(`${origin}/toilet/900001`)).text(),/세종특별자치시/)
  deleted=true
  assert.equal((await invalidate()).status,200)
  assert.equal((await fetch(`${origin}/toilet/900001`)).status,404)
  deleted=false
  assert.equal((await invalidate()).status,200)
  assert.equal((await fetch(`${origin}/toilet/900001`)).status,200,'invalidate must also evict a cached 404')
  const noCoords = await fetch(`${origin}/toilet/900002`)
  assert.equal(noCoords.status,200)
  assert.match(await noCoords.text(),/충청남도 천안시 서북구 검증동 1/)
  for(const id of ['bad','0','01','900404']) {
    const missing = await fetch(`${origin}/toilet/${id}`)
    assert.equal(missing.status,404,`real HTTP 404: ${id}`)
    assert.match(await missing.text(),/화장실 정보를 찾을 수 없습니다/)
  }
  assert.equal(counts.has('/api/v1/toilets/bad'),false)
  const unavailable = await fetch(`${origin}/toilet/900500`)
  assert.equal(unavailable.status,500,'upstream outage is not a missing toilet')
  await unavailable.text()
  console.log(JSON.stringify({result:'PASS',ssr:true,canonical:true,noindex:true,cacheHits:3,initialUpstreamRequests:1,signedInvalidation:true,forgedRequestRejected:true,regionRemoved:true,deletionAndRestoration:true,real404Cases:4,missingCoordinates:true,upstreamFailureStatus:500},null,2))
} finally {
  if(server && server.exitCode===null) { server.kill(); await once(server,'exit') }
  api.closeAllConnections()
  await new Promise(resolve=>api.close(resolve))
}
