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
  for(let i=0;i<2;i++) assert.deepEqual(await authenticateRevalidation(request('{"toiletIds":[1,2,1]}'),secret,now),[1,2])
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
  for(const body of ['{','{}','{"toiletIds":[]}','{"toiletIds":[0]}','{"toiletIds":["1"]}','{"toiletIds":[9007199254740992]}','{"toiletIds":[1],"path":"/"}',JSON.stringify({toiletIds:Array(101).fill(1)})]) await reject(request(body),400)
  await reject(request(' '.repeat(4097)),413)
})
