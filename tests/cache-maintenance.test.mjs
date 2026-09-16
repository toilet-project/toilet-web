import assert from 'node:assert/strict'
import test from 'node:test'
import {authenticateCacheRefresh,CACHE_REFRESH_PATH,maintenanceSignatureFor} from '../src/server/cacheMaintenance.ts'

const secret='maintenance-test-signing-secret-at-least-32-bytes'
const now=1789600000000,timestamp=String(now/1000)
const request=(body,time=timestamp,signature=maintenanceSignatureFor(secret,time,body))=>new Request(`https://example.test${CACHE_REFRESH_PATH}`,{
  method:'POST',headers:{'content-type':'application/json','x-cache-timestamp':time,'x-cache-signature':signature},body})

test('maintenance signature accepts one bounded toilet ID',async()=>{
  const body=JSON.stringify({contractVersion:1,toiletId:53585})
  assert.deepEqual(await authenticateCacheRefresh(request(body),secret,now),{toiletId:53585})
  assert.equal(maintenanceSignatureFor(secret,'1789600000',body),'6dcc4ae7dc19251b79b8ca492bae181b338cf50a7a1181b620d74152045320f9')
})
test('maintenance endpoint is disabled without its dedicated secret',async()=>{
  await assert.rejects(authenticateCacheRefresh(request('{"contractVersion":1,"toiletId":1}'),'short',now),error=>error.status===503)
})
test('maintenance authentication rejects tampering, extra fields and invalid IDs',async()=>{
  const valid='{"contractVersion":1,"toiletId":1}'
  await assert.rejects(authenticateCacheRefresh(request(valid,timestamp,'0'.repeat(64)),secret,now),error=>error.status===401)
  for(const body of ['{}','{"contractVersion":1,"toiletId":0}','{"contractVersion":1,"toiletId":"1"}',
    '{"contractVersion":1,"toiletId":1,"path":"/"}']){
    await assert.rejects(authenticateCacheRefresh(request(body),secret,now),error=>error.status===400)
  }
})
