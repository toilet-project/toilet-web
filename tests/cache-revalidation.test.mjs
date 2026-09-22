import assert from 'node:assert/strict'
import test from 'node:test'
import {authenticateRevalidation, signatureFor, REVALIDATION_PATH} from '../src/server/cacheRevalidation.ts'
const secret = 'test-only-signing-secret-at-least-32-bytes'
const now = 1788600000000
const timestamp = String(now / 1000)
const request = (body, time=timestamp, signature=signatureFor(secret,time,body)) => new Request(`https://example.test${REVALIDATION_PATH}`,{method:'POST',headers:{'content-type':'application/json','x-cache-timestamp':time,'x-cache-signature':signature},body})
const reject = async (req,status,key=secret) => assert.rejects(authenticateRevalidation(req,key,now), e=>e.status===status)

test('shared Java/Node HMAC contract vector',()=>{
  assert.equal(signatureFor(secret,'1788600000','{"toiletIds":[1,2]}'),'6d1dad9672475e2a451aa566d4c55b6a2595a653e0bbe08689a151f33485b4d3')
})

test('signed valid IDs accepted and duplicate delivery is harmless',async()=>{
  for(let i=0;i<2;i++) assert.deepEqual(await authenticateRevalidation(request('{"toiletIds":[1,2,1]}'),secret,now),{
    protocol:'v1',events:[
      {toiletId:1,revision:0,action:'UPSERT',catalogChanged:false},
      {toiletId:2,revision:0,action:'UPSERT',catalogChanged:false},
    ],
  })
})
test('signed v2 events retain the latest revision and deletion precedence',async()=>{
  const body=JSON.stringify({contractVersion:2,events:[
    {toiletId:1,revision:2,action:'UPSERT',catalogChanged:false},
    {toiletId:1,revision:3,action:'DELETE',catalogChanged:true},
    {toiletId:2,revision:4,action:'UPSERT',catalogChanged:false},
  ]})
  assert.deepEqual(await authenticateRevalidation(request(body),secret,now),{protocol:'v2',events:[
    {toiletId:1,revision:3,action:'DELETE',catalogChanged:true},
    {toiletId:2,revision:4,action:'UPSERT',catalogChanged:false},
  ]})
})
test('signed v3 region envelopes are accepted without losing old positions',async()=>{
  const bounds={west:126.98,south:37.5622338,east:127.0245747,north:37.57}
  const body=JSON.stringify({contractVersion:3,events:[
    {toiletId:1,revision:5,action:'UPSERT',catalogChanged:true,regionScopeComplete:true,regionBounds:bounds},
    {toiletId:2,revision:1,action:'DELETE',catalogChanged:true,regionScopeComplete:false,regionBounds:null},
  ]})
  assert.deepEqual(await authenticateRevalidation(request(body),secret,now),{protocol:'v3',events:[
    {toiletId:1,revision:5,action:'UPSERT',catalogChanged:true,regionScopeComplete:true,regionBounds:bounds},
    {toiletId:2,revision:1,action:'DELETE',catalogChanged:true,regionScopeComplete:false,regionBounds:null},
  ]})
})
test('tampered payload/signature and expired or future signatures rejected',async()=>{
  await reject(request('{"toiletIds":[2]}',timestamp,signatureFor(secret,timestamp,'{"toiletIds":[1]}')),401)
  await reject(request('{"toiletIds":[1]}',timestamp,'0'.repeat(64)),401)
  await reject(request('{"toiletIds":[1]}',String(Number(timestamp)-301)),401)
  await reject(request('{"toiletIds":[1]}',String(Number(timestamp)+301)),401)
})
test('no secret means disabled, not publicly accessible',async()=>{
  await reject(request('{"toiletIds":[1]}'),503,'')
  await reject(request('{"toiletIds":[1]}'),503,'short')
})
test('path/tag injection, bad IDs, malformed JSON and excessive batches rejected',async()=>{
  for(const body of ['{','{}','{"toiletIds":[]}','{"toiletIds":[0]}','{"toiletIds":["1"]}','{"toiletIds":[9007199254740992]}','{"toiletIds":[1],"path":"/"}',
    JSON.stringify({toiletIds:Array(101).fill(1)}), JSON.stringify({contractVersion:2,events:[{toiletId:1,revision:0,action:'UPSERT',catalogChanged:false}]}),
    JSON.stringify({contractVersion:2,events:[{toiletId:1,revision:1,action:'UPSERT',catalogChanged:false,path:'/'}]}),
    JSON.stringify({contractVersion:3,events:[{toiletId:1,revision:1,action:'UPSERT',catalogChanged:false,regionScopeComplete:true,regionBounds:{west:128,south:37,east:127,north:38}}]}),
    JSON.stringify({contractVersion:3,events:[{toiletId:1,revision:1,action:'UPSERT',catalogChanged:false,regionScopeComplete:true,regionBounds:{west:127,south:37,east:128,north:38,path:'/evil'}}]}),
    JSON.stringify({contractVersion:3,events:[{toiletId:1,revision:1,action:'UPSERT',catalogChanged:false,regionScopeComplete:true,regionBounds:null},
      {toiletId:1,revision:2,action:'DELETE',catalogChanged:true,regionScopeComplete:false,regionBounds:null}]})]) await reject(request(body),400)
  await reject(request(' '.repeat(32769)),413)
})
