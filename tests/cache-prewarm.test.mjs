import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {collectPublicToiletIds,prewarmToiletPages,requestDetail} from '../scripts/cache/prewarm-lib.mjs'

const response=(body,{status=200,headers={}}={})=>new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers})
test('public IDs are collected from same-origin sitemap shards only',async()=>{
  const routes=new Map([
    ['https://preview.example/sitemap.xml','<sitemapindex><loc>https://preview.example/sitemap-toilets-0.xml</loc><loc>https://preview.example/pages-sitemap.xml</loc></sitemapindex>'],
    ['https://preview.example/sitemap-toilets-0.xml','<urlset><loc>https://preview.example/toilet/2</loc><loc>https://preview.example/toilet/1</loc><loc>https://preview.example/toilet/2</loc></urlset>'],
  ])
  const ids=await collectPublicToiletIds({baseUrl:'https://preview.example',fetchImpl:async url=>response(routes.get(String(url)))})
  assert.deepEqual(ids,[2,1])
})
test('checkpoint, bounded workers and cache evidence complete a sample',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'prewarm-')),checkpointPath=join(directory,'checkpoint.json')
  const hits=new Map(),progress=[]
  const fetchImpl=async url=>{
    const parsed=new URL(url)
    if(parsed.pathname==='/version.json')return response({version:'deploy-1'})
    const id=Number(parsed.pathname.split('/').pop()),count=(hits.get(id)||0)+1;hits.set(id,count)
    return response('page',{headers:{'x-nextjs-cache':count>1?'HIT':'MISS'}})
  }
  try{
    const report=await prewarmToiletPages({fetchImpl,waitImpl:async()=>{},baseUrl:'https://preview.example',deploymentId:'deploy-1',ids:[1,2,3],checkpointPath,
      concurrency:2,rps:50,maxSeconds:60,retries:1,verifySamples:2,versionCheckEvery:1,onProgress:value=>progress.push(value)})
    assert.deepEqual(report.succeeded.sort(),[1,2,3]);assert.equal(report.failed.length,0);assert.equal(report.cacheVerification.length,2)
    assert.equal(JSON.parse(await readFile(checkpointPath,'utf8')).completedIds.length,3);assert.equal(progress.at(-1).completed,3)
  }finally{await rm(directory,{recursive:true,force:true})}
})
test('a changed target deployment stops the run',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'prewarm-')),checkpointPath=join(directory,'checkpoint.json');let checks=0
  try{
    let error
    try { await prewarmToiletPages({fetchImpl:async url=>new URL(url).pathname==='/version.json'?response({version:++checks>1?'deploy-2':'deploy-1'}):response('page'),
      waitImpl:async()=>{},baseUrl:'https://preview.example',deploymentId:'deploy-1',ids:[1],checkpointPath,concurrency:1,rps:50,maxSeconds:60,retries:0,
      verifySamples:0,versionCheckEvery:1}) } catch (caught) { error=caught }
    assert.match(error.message,/Deployment changed/)
    assert.equal(error.report.deploymentId,'deploy-1');assert.equal(error.report.succeeded.length,1);assert.ok(error.report.finishedAt)
  }finally{await rm(directory,{recursive:true,force:true})}
})
test('detail requests consume the body and time out before retrying',async()=>{
  let attempts=0,consumed=0
  const successful=await requestDetail({baseUrl:'https://preview.example',id:1,retries:0,requestTimeoutMs:100,
    waitImpl:async()=>{},fetchImpl:async()=>({ok:true,headers:new Headers(),arrayBuffer:async()=>{consumed++;return new ArrayBuffer(0)}})})
  assert.equal(successful.ok,true);assert.equal(consumed,1)
  await assert.rejects(requestDetail({baseUrl:'https://preview.example',id:2,retries:1,requestTimeoutMs:5,waitImpl:async()=>{},fetchImpl:async(_url,{signal})=>{
    attempts++
    return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))
  }}),/timeout|aborted/i)
  assert.equal(attempts,2)
})
test('fresh mode checkpoints an ID only after HIT or REVALIDATED evidence',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'prewarm-fresh-')),checkpointPath=join(directory,'checkpoint.json')
  const attempts=new Map(),waits=[]
  const fetchImpl=async url=>{
    const parsed=new URL(url)
    if(parsed.pathname==='/version.json') return response({version:'deploy-fresh'})
    const id=Number(parsed.pathname.split('/').pop()),count=(attempts.get(id)||0)+1;attempts.set(id,count)
    const evidence=id===1?(count<3?'STALE':'HIT'):(count===1?'MISS':'REVALIDATED')
    return response('page',{headers:{'x-nextjs-cache':evidence}})
  }
  try{
    const report=await prewarmToiletPages({fetchImpl,waitImpl:async milliseconds=>waits.push(milliseconds),baseUrl:'https://preview.example',
      deploymentId:'deploy-fresh',ids:[1,2],checkpointPath,concurrency:2,rps:50,maxSeconds:60,retries:0,requestTimeoutMs:100,
      requireFresh:true,freshAttempts:3,freshWaitMs:10,verifySamples:0,versionCheckEvery:25})
    assert.deepEqual(report.succeeded.sort(),[1,2]);assert.equal(report.failed.length,0);assert.equal(report.freshRequired,true)
    assert.deepEqual(report.cacheEvidenceCounts,{HIT:1,STALE:2,REVALIDATED:1,MISS:1,NONE:0})
    assert.equal(report.requestCount,5);assert.ok(report.requestsPerSecond>=report.completedIdsPerSecond)
    assert.equal(waits.filter(value=>value===10).length,3)
    assert.deepEqual(JSON.parse(await readFile(checkpointPath,'utf8')).completedIds,[1,2])
  }finally{await rm(directory,{recursive:true,force:true})}
})
test('fresh mode leaves repeatedly stale IDs retryable',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'prewarm-stale-')),checkpointPath=join(directory,'checkpoint.json')
  const fetchImpl=async url=>new URL(url).pathname==='/version.json'?response({version:'deploy-stale'}):response('page',{headers:{'x-nextjs-cache':'STALE'}})
  try{
    const report=await prewarmToiletPages({fetchImpl,waitImpl:async()=>{},baseUrl:'https://preview.example',deploymentId:'deploy-stale',ids:[7],
      checkpointPath,concurrency:1,rps:50,maxSeconds:60,retries:0,requestTimeoutMs:100,requireFresh:true,freshAttempts:2,freshWaitMs:1,
      verifySamples:0,versionCheckEvery:25})
    assert.equal(report.succeeded.length,0);assert.equal(report.failed.length,1);assert.match(report.failed[0].error,/Fresh cache not observed/)
    const checkpoint=JSON.parse(await readFile(checkpointPath,'utf8'))
    assert.deepEqual(checkpoint.completedIds,[]);assert.match(checkpoint.failures['7'],/last evidence: STALE/)
  }finally{await rm(directory,{recursive:true,force:true})}
})
