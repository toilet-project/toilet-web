// Authorized preview-only integration test. Mutates cache metadata, never toilet data.
// Creates a temporary secret only if absent, then removes it in finally.
import assert from 'node:assert/strict'
import { randomBytes, createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

assert.ok(process.argv.includes('--approved-preview-test'), 'Explicit preview test flag required')
const origin = 'https://geupddong-web-preview.dlgksqls7218.workers.dev'
const worker = 'geupddong-web-preview'
const database = 'geupddong-next-preview-tags'
const secretName = 'CACHE_REVALIDATION_SECRET'
const path = '/_internal/cache/revalidate'
const id = 13448
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'))
assert.equal(config.name, worker)
assert.equal(config.routes, undefined)
assert.equal(config.route, undefined)
assert.equal(config.d1_databases[0].database_id, 'bbf77cf5-62e9-4c94-a8ec-a45c0e26deed')
assert.equal(config.r2_buckets[0].bucket_name, 'geupddong-next-preview-cache')
const cli = resolve('node_modules/wrangler/bin/wrangler.js')
function wrangler(args, input) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    input, encoding: 'utf8', timeout: 60_000,
    env: {...process.env, WRANGLER_SEND_METRICS:'false', CLOUDFLARE_ACCOUNT_ID:'1611d88218de929b3ed6e2cd7c863be5'},
  })
  // Do not print tool output: it may contain credentials or request headers.
  assert.equal(result.status, 0, `Wrangler ${args.slice(0, 2).join(' ')} failed; inspect locally without disclosing secrets`)
  return result.stdout
}
const listSecrets = () => JSON.parse(wrangler(['secret', 'list', '--name', worker]))
assert.ok(!listSecrets().some(item => item.name === secretName), 'Refusing to replace an existing secret')
const buildResponse=await fetch(origin+'/BUILD_ID',{signal:AbortSignal.timeout(30_000)})
assert.equal(buildResponse.status,200)
const buildId=(await buildResponse.text()).trim()
assert.match(buildId,/^[A-Za-z0-9_-]+$/)
// OpenNext namespaces durable tags by the deployed build, not the source checkout.
const readTag = () => JSON.parse(wrangler(['d1', 'execute', database, '--remote', '--json', '--command',
  `SELECT tag,revalidatedAt,stale,expire FROM revalidations WHERE tag='${buildId}/toilet:13448'`]))[0].results
const results = []
const secret = randomBytes(32).toString('hex')
let attemptedInstall = false
function signed(body, offset = 0) {
  const timestamp = String(Math.floor(Date.now() / 1000) + offset)
  return {'Content-Type':'application/json','x-cache-timestamp':timestamp,
    'x-cache-signature':createHmac('sha256',secret).update(`v1\nPOST\n${path}\n${timestamp}\n${body}`).digest('hex')}
}
async function post(label, body, headers, expected) {
  const response = await fetch(origin + path, {method:'POST',body,headers,signal:AbortSignal.timeout(30_000)})
  const payload = await response.json()
  results.push({label,status:response.status})
  assert.equal(response.status, expected, `${label}: unexpected HTTP status`)
  assert.match(response.headers.get('cache-control') || '', /no-store/)
  return payload
}
async function detail(label) {
  const response = await fetch(`${origin}/toilet/${id}`, {signal:AbortSignal.timeout(30_000)})
  await response.arrayBuffer()
  const cache = response.headers.get('x-nextjs-cache')
  results.push({label,status:response.status,cache})
  assert.equal(response.status, 200)
  return cache
}
try {
  attemptedInstall = true
  wrangler(['secret','put',secretName,'--name',worker], secret + '\n')
  assert.ok(listSecrets().some(item => item.name === secretName))
  // Allow bounded propagation only; no unlimited retries or destructive data setup.
  const body = JSON.stringify({toiletIds:[id]})
  let ready = false
  for (let attempt=0; attempt<6; attempt++) {
    const response=await fetch(origin+path,{method:'POST',body,headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(30_000)})
    await response.arrayBuffer()
    if(response.status===401) {ready=true;break}
    assert.equal(response.status,503)
    await delay(2000)
  }
  assert.ok(ready,'Secret propagation did not complete')
  await detail('warm')
  let cacheReady=false
  for(let attempt=0;attempt<8;attempt++) {
    if(await detail('before invalidation')==='HIT') {cacheReady=true;break}
    await delay(2000)
  }
  assert.ok(cacheReady,'Background cache refill did not complete within the bounded warm-up')
  const before = readTag()
  await post('unsigned rejected',body,{'Content-Type':'application/json'},401)
  await post('tampered signature rejected',body,{...signed(body),'x-cache-signature':'0'.repeat(64)},401)
  await post('expired rejected',body,signed(body,-600),401)
  const invalid=JSON.stringify({toiletIds:['../../']})
  await post('invalid IDs rejected',invalid,signed(invalid),400)
  assert.deepEqual(readTag(),before,'Rejected requests changed tag metadata')
  const acceptedAt=Date.now()
  assert.deepEqual(await post('valid accepted',body,signed(body),200),{ok:true,acceptedIds:[id]})
  const after=readTag()
  assert.equal(after.length,1)
  assert.ok(after[0].expire>=acceptedAt-10000,'Durable tag expiry was not persisted')
  results.push({label:'durable D1 tag confirmed',...after[0]})
  assert.equal(await detail('after invalidation'),'MISS')
  assert.equal(await detail('after refill'),'HIT')
  const duplicateBody=JSON.stringify({toiletIds:[id,id]})
  assert.deepEqual(await post('duplicate IDs accepted once',duplicateBody,signed(duplicateBody),200),{ok:true,acceptedIds:[id]})
  await detail('refill after duplicate')
} finally {
  if(attemptedInstall) {
    // This run verified absence before installing; remove only its own preview test key.
    wrangler(['secret','delete',secretName,'--name',worker], 'y\n')
    assert.ok(!listSecrets().some(item=>item.name===secretName),'Temporary key cleanup failed')
    results.push({label:'temporary secret removed'})
  }
  console.log(JSON.stringify({results,note:'Preview cache only. No production toilet writes. Not Spring outbox end-to-end or a CPU/load test.'},null,2))
}
