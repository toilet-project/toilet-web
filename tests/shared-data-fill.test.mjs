import test from 'node:test'
import assert from 'node:assert/strict'
import { fillFingerprint, fillSharedData, selectInvalidatedPublicIds } from '../scripts/cache/fill-shared-lib.mjs'
const baseUrl = 'https://geupddong.com'
const object = (id, state) => ({ key: `public-toilets/v1/toilets/${id}.json`, metadata: { state } })
test('fill selects only invalidated public IDs, preserving fresh and hidden/deleted records', () => {
  assert.deepEqual(selectInvalidatedPublicIds([object(1,'data'),object(2,'invalidated'),object(3,'deleted'),object(4,'invalidated')],[1,2,3]),[2])
  assert.throws(() => selectInvalidatedPublicIds([{key:'incremental-cache/unrelated'}],[1]))
})
function options(ids) {
  return { ids, baseUrl, checkpoint: { schema:1, fingerprint:fillFingerprint(baseUrl,ids), completed:[], notFound:[] },
    save:async()=>{}, wait:async()=>{}, concurrency:1 }
}
test('resumes exact selection, consumes only public JSON, and records removed facilities without forced refresh', async () => {
  const opts=options([1,2,3]);opts.checkpoint.completed=[1]
  const urls=[]
  const report=await fillSharedData({...opts,fetchImpl:async(url,init)=>{
    urls.push(url);assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error')
    return url.endsWith('/2')?Response.json({id:2,name:'시설'}):new Response('',{status:404})
  }})
  assert.deepEqual(urls,[`${baseUrl}/api/public/toilets/2`,`${baseUrl}/api/public/toilets/3`])
  assert.equal(report.remaining,0);assert.equal(report.completedTotal,2);assert.equal(report.notFound,1)
})
test('stops new work on rate limit or origin failure and keeps completed checkpoint', async () => {
  for(const status of [429,503]){
    let calls=0,saved
    const report=await fillSharedData({...options([1,2,3]),save:async x=>{saved=x},fetchImpl:async()=>{
      calls++;return calls===1?Response.json({id:1,name:'시설'}):new Response('',{status})
    }})
    assert.equal(calls,2);assert.equal(report.failures.length,1);assert.deepEqual(saved.completed,[1])
  }
})
test('rejects a changed target set and spaces requests within the configured rate',async()=>{
  let calls=0,time=0;const starts=[]
  const opts=options([1,2,3])
  await assert.rejects(fillSharedData({...opts,ids:[1,2],fetchImpl:async()=>{calls++}}),/Checkpoint mismatch/)
  assert.equal(calls,0)
  await fillSharedData({...opts,now:()=>time,wait:async ms=>{time+=ms},rps:2,fetchImpl:async url=>{
    starts.push(time);return Response.json({id:Number(url.split('/').at(-1)),name:'시설'})
  }})
  assert.deepEqual(starts,[0,500,1000])
})
