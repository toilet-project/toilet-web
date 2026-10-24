import assert from 'node:assert/strict'
import test from 'node:test'
import {R2S3Store} from '../scripts/cache/r2-s3-store.mjs'
import {runIncrementalCacheCleanup} from '../scripts/cache/cleanup-runner-lib.mjs'
import {planIncrementalCacheCleanup} from '../scripts/cache/cleanup-lib.mjs'

const escaped=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
const acknowledgement=keys=>`<?xml version="1.0" encoding="UTF-8"?><DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${keys.map(key=>`<Deleted><Key>${escaped(key)}</Key></Deleted>`).join('')}</DeleteResult>`
const config={accountId:'a'.repeat(32),accessKeyId:'test-access',secretAccessKey:'test-secret',bucket:'test-cache'}

function storeWithResponse(body,status=200){
  const requests=[]
  const store=new R2S3Store({...config,fetchImpl:async request=>{
    requests.push(await request.text())
    return new Response(body,{status})
  }})
  return {store,requests}
}

test('Quiet=false confirms exactly the requested unique keys, including XML escaping and arbitrary response order',async()=>{
  const keys=['incremental-cache/retired/a&<b>.cache','incremental-cache/retired/c.cache']
  const {store,requests}=storeWithResponse(acknowledgement([...keys].reverse()))
  const progress=[]
  await store.delete(keys,{onBatch:value=>progress.push(value)})
  assert.deepEqual(progress,[{deletedFiles:2,totalFiles:2}])
  assert.match(requests[0],/<Quiet>false<\/Quiet>/)
  assert.match(requests[0],/a&amp;&lt;b&gt;\.cache/)
})

for(const [name,body,confirmed] of [
  ['empty response','',[]],
  ['truncated XML','<DeleteResult><Deleted><Key>a</Key></Deleted>',['a']],
  ['empty result','<DeleteResult></DeleteResult>',[]],
  ['missing acknowledgement',acknowledgement(['a']),['a']],
  ['duplicate acknowledgement',acknowledgement(['a','a']),['a']],
  ['unexpected acknowledgement',acknowledgement(['a','unexpected']),['a']],
  ['malformed child','<DeleteResult><Deleted><Key>a</Key></Deleted><Broken></DeleteResult>',[]],
  ['malformed entity','<DeleteResult><Deleted><Key>a</Key></Deleted><Deleted><Key>b&invalid;</Key></Deleted></DeleteResult>',['a']],
  ['error with a successful sibling','<DeleteResult><Deleted><Key>a</Key></Deleted><Error><Key>b</Key><Code>AccessDenied</Code><Message>PRIVATE_TOKEN</Message></Error></DeleteResult>',['a']],
]){
  test(`${name} never reports a completely successful delete`,async()=>{
    const {store}=storeWithResponse(body),complete=[],partial=[]
    await assert.rejects(store.delete(['a','b'],{onBatch:value=>complete.push(value),onPartialBatch:value=>partial.push(value)}),
      error=>error.message==='R2 delete acknowledgement is incomplete'&&!error.message.includes('PRIVATE_TOKEN'))
    assert.equal(complete.length,0)
    // An unclosed outer document cannot prove any acknowledgement.
    assert.deepEqual(partial[0].acknowledgedKeys,name==='truncated XML'?[]:confirmed)
  })
}

test('duplicate request keys and a non-2xx response never become successful acknowledgements',async()=>{
  const {store,requests}=storeWithResponse(acknowledgement(['a']))
  await assert.rejects(store.delete(['a','a']),/unique object keys/)
  assert.equal(requests.length,0)
  const failed=storeWithResponse('PRIVATE_TOKEN',503),complete=[],partial=[]
  await assert.rejects(failed.store.delete(['a'],{onBatch:value=>complete.push(value),onPartialBatch:value=>partial.push(value)}),/R2 delete failed \(503\)/)
  assert.deepEqual(complete,[]);assert.deepEqual(partial,[])
})

test('partial R2 acknowledgements become confirmed file/byte lower bounds without exposing response bodies',async()=>{
  const active='11111111-1111-4111-8111-111111111111',previous='22222222-2222-4222-8222-222222222222',old='33333333-3333-4333-8333-333333333333'
  const releases=[{schema:1,workerVersion:old,appVersion:'old',deployedAt:'2026-10-01T00:00:00Z'},
    {schema:1,workerVersion:previous,appVersion:'previous',deployedAt:'2026-10-10T00:00:00Z'},
    {schema:1,workerVersion:active,appVersion:'active',deployedAt:'2026-10-20T00:00:00Z'}]
  const objects=[{key:'incremental-cache/old/a.cache',size:20},{key:'incremental-cache/old/b.cache',size:30}]
  const plan=planIncrementalCacheCleanup({objects,releases,activeWorkerVersions:[active],rollbackProtectionDays:3})
  const args={registry:'registry.json',report:'report.json',execute:true,'expected-delete-files':'2','expected-delete-bytes':'50',
    'expected-delete-fingerprint':plan.deleteFingerprint}
  const body=`<DeleteResult><Deleted><Key>${objects[0].key}</Key></Deleted><Error><Key>${objects[1].key}</Key><Code>Denied</Code><Message>PRIVATE_TOKEN</Message></Error></DeleteResult>`
  const {store}=storeWithResponse(body)
  const reports=[]
  const result=await runIncrementalCacheCleanup({args,env:{CACHE_CLEANUP_ENABLED:'true',R2_INCREMENTAL_CACHE_BUCKET:'geupddong-next-production-cache'},
    getDeploymentStatus:async()=>({workerName:'worker',activeWorkerVersions:[active]}),readRegistry:async()=>releases,
    createStore:()=>({list:async()=>objects,delete:(keys,callbacks)=>store.delete(keys,callbacks)}),writeReport:async value=>reports.push(value)})
  assert.equal(result.failure.code,'delete-acknowledgement-incomplete')
  assert.equal(result.execution.deletedFiles,1);assert.equal(result.execution.deletedBytes,20)
  assert.equal(result.execution.deletedFilesExact,false);assert.equal(result.execution.deletedBytesExact,false)
  assert.equal(result.execution.deletionOutcomeUnknown,true)
  assert.doesNotMatch(JSON.stringify([result,reports]),/PRIVATE_TOKEN|AccessDenied/)
})
