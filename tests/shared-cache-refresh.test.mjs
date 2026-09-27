import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {maintenanceSignatureFor,partitionToiletIds,refreshSharedToiletData} from '../scripts/cache/shared-refresh-lib.mjs'
import {collectPublicDetailIds} from '../scripts/cache/prewarm-lib.mjs'

const response=value=>new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}})

test('refresh catalog covers public details without needing any coordinates or map payload',async()=>{
  const requested=[]
  const ids=await collectPublicDetailIds({baseUrl:'https://api.example',fetchImpl:async url=>{
    const path=new URL(url).pathname+new URL(url).search;requested.push(path)
    return response(path.endsWith('/shards')?[0,1]:path.endsWith('shard=0')?[1,3]:[10001])
  }})
  assert.deepEqual(ids,[1,3,10001])
  assert.deepEqual(requested,['/api/v1/toilets/sitemap/shards','/api/v1/toilets/sitemap/ids?shard=0','/api/v1/toilets/sitemap/ids?shard=1'])
})

test('refresh rejects malformed, duplicate, empty and failed catalogs instead of silently missing facilities',async()=>{
  for(const [shards,ids] of [[[],[1]],[[0,0],[1]],[[0],['1']],[[0],[1,1]],[[0],[]]]){
    await assert.rejects(collectPublicDetailIds({baseUrl:'https://api.example',fetchImpl:async url=>response(String(url).endsWith('/shards')?shards:ids)}))
  }
  await assert.rejects(collectPublicDetailIds({baseUrl:'https://api.example',retries:0,fetchImpl:async url=>
    String(url).endsWith('/shards')?response([0]):new Response('',{status:503})}),/Source request failed/)
})

test('stable ID modulo partitions cover each toilet exactly once',()=>{
  const ids=[1,2,3,28,29,56,57]
  const groups=Array.from({length:28},(_,partition)=>partitionToiletIds(ids,partition,28)).flat()
  assert.deepEqual(groups.sort((a,b)=>a-b),ids)
  assert.deepEqual(partitionToiletIds(ids,1,28),[1,29,57])
})
test('refresh checkpoint resumes without a deployment identity and signs every request',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'shared-refresh-')),checkpointPath=join(directory,'checkpoint.json')
  const requested=[]
  const fetchImpl=async(url,init)=>{
    const body=JSON.parse(init.body),timestamp=init.headers['x-cache-timestamp']
    assert.equal(new URL(url).pathname,'/_internal/cache/refresh-toilet')
    assert.equal(init.headers['x-cache-signature'],maintenanceSignatureFor('x'.repeat(32),timestamp,init.body))
    requested.push(body.toiletId)
    return response({ok:true,toiletId:body.toiletId,state:'data',storedAt:1000+body.toiletId})
  }
  const options={fetchImpl,waitImpl:async()=>{},baseUrl:'https://example.test',secret:'x'.repeat(32),cycleId:'cycle-1',partition:1,
    partitionCount:28,ids:[1,29,57],checkpointPath,concurrency:2,rps:25,maxSeconds:60,retries:1,requestTimeoutMs:1000,
    progressEvery:2}
  try{
    const first=await refreshSharedToiletData(options)
    assert.deepEqual(first.succeeded.sort((a,b)=>a-b),[1,29,57])
    const second=await refreshSharedToiletData(options)
    assert.equal(second.resumedCount,3);assert.equal(second.requestCount,0)
    assert.deepEqual(requested.sort((a,b)=>a-b),[1,29,57])
    const checkpoint=JSON.parse(await readFile(checkpointPath,'utf8'))
    assert.deepEqual(checkpoint.completedIds,[1,29,57])
  }finally{await rm(directory,{recursive:true,force:true})}
})
