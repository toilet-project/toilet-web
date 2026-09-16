import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import test from 'node:test'
import {applySharedToiletInvalidation,readThroughSharedToiletCache,refreshSharedToiletCache,SHARED_TOILET_CACHE_SCHEMA,sharedToiletCacheKey} from '../src/server/sharedToiletCache.ts'

class FakeR2 {
  objects=new Map(); sequence=0
  async get(key){
    const found=this.objects.get(key)
    return found ? {etag:found.etag,json:async()=>JSON.parse(found.value)} : null
  }
  async put(key,value,options={}){
    const current=this.objects.get(key), only=options.onlyIf
    if(only?.etagDoesNotMatch==='*' && current) return null
    if(only?.etagMatches && current?.etag!==only.etagMatches) return null
    const etag=`etag-${++this.sequence}`
    this.objects.set(key,{etag,value,options})
    return {etag}
  }
  value(id){return JSON.parse(this.objects.get(sharedToiletCacheKey(id)).value)}
}

function detail(id,name='공개 화장실'){
  return {id,name,toiletType:'개방화장실',roadAddress:'도로명',jibunAddress:'지번',latitude:37.1,longitude:127.1,
    region:{sidoName:'경기도',sidoCode:'41',sigunguName:'부천시',sigunguCode:'41190',cityName:'부천시',districtName:null},
    maleToiletCount:1,maleUrinalCount:1,maleDisabledToiletCount:0,maleDisabledUrinalCount:0,maleChildToiletCount:0,maleChildUrinalCount:0,
    femaleToiletCount:1,femaleDisabledToiletCount:0,femaleChildToiletCount:0,agencyName:'기관',phoneNumber:'',openTime:'상시',openTimeDetail:'',
    installationDate:'',hasEmergencyBell:'N',emergencyBellLocation:'',hasCctv:'N',hasDiaperTable:'N',diaperTableLocation:'',dataBaseDate:'2026-09-15',dataSource:'공공데이터'}
}

test('public detail is reused across callers and extra personal fields never persist',async()=>{
  const bucket=new FakeR2(); let calls=0
  const origin={...detail(7),email:'private@example.test',accessToken:'secret'}
  const first=await readThroughSharedToiletCache({bucket,toiletId:7,fetchOrigin:async()=>{calls++;return origin},now:()=>1000})
  const second=await readThroughSharedToiletCache({bucket,toiletId:7,fetchOrigin:async()=>{calls++;return detail(7,'wrong')},now:()=>2000})
  assert.equal(first.name,'공개 화장실'); assert.equal(second.name,'공개 화장실'); assert.equal(calls,1)
  assert.equal(bucket.value(7).data.email,undefined); assert.equal(bucket.value(7).data.accessToken,undefined)
})

test('an incompatible object is conditionally replaced from the public origin',async()=>{
  const bucket=new FakeR2()
  await bucket.put(sharedToiletCacheKey(6),JSON.stringify({schema:999,toiletId:6}))
  assert.equal((await readThroughSharedToiletCache({bucket,toiletId:6,fetchOrigin:async()=>detail(6)})).name,'공개 화장실')
  assert.equal(bucket.value(6).schema,SHARED_TOILET_CACHE_SCHEMA)
  assert.equal(bucket.value(6).state,'data')
})

test('short negative entries avoid repeated origin misses',async()=>{
  const bucket=new FakeR2(); let calls=0
  assert.equal(await readThroughSharedToiletCache({bucket,toiletId:8,fetchOrigin:async()=>{calls++;return null},now:()=>1000}),null)
  assert.equal(await readThroughSharedToiletCache({bucket,toiletId:8,fetchOrigin:async()=>{calls++;return detail(8)},now:()=>2000}),null)
  assert.equal(calls,1); assert.equal(bucket.value(8).state,'negative')
})

test('a newer invalidation wins over an older fetch that started first',async()=>{
  const bucket=new FakeR2()
  await applySharedToiletInvalidation(bucket,{toiletId:9,revision:1,action:'UPSERT',catalogChanged:false},()=>1000)
  let calls=0
  const value=await readThroughSharedToiletCache({bucket,toiletId:9,now:()=>3000,fetchOrigin:async()=>{
    calls++
    if(calls===1){await applySharedToiletInvalidation(bucket,{toiletId:9,revision:2,action:'UPSERT',catalogChanged:false},()=>2000);return detail(9,'old')}
    return detail(9,'new')
  }})
  assert.equal(value.name,'new'); assert.equal(bucket.value(9).revision,2); assert.equal(bucket.value(9).data.name,'new')
})

test('delete tombstones survive duplicate and out-of-order upserts without origin reads',async()=>{
  const bucket=new FakeR2(); let calls=0
  await applySharedToiletInvalidation(bucket,{toiletId:10,revision:5,action:'DELETE',catalogChanged:true},()=>1000)
  await applySharedToiletInvalidation(bucket,{toiletId:10,revision:4,action:'UPSERT',catalogChanged:false},()=>2000)
  await applySharedToiletInvalidation(bucket,{toiletId:10,revision:5,action:'UPSERT',catalogChanged:false},()=>3000)
  assert.equal(await readThroughSharedToiletCache({bucket,toiletId:10,fetchOrigin:async()=>{calls++;return detail(10)}}),null)
  assert.equal(calls,0); assert.equal(bucket.value(10).state,'deleted'); assert.equal(bucket.value(10).revision,5)
})

test('fresh data is refreshed after 30 days and stale data is bounded to seven more days',async()=>{
  const bucket=new FakeR2();let calls=0
  await readThroughSharedToiletCache({bucket,toiletId:11,fetchOrigin:async()=>detail(11),now:()=>1000})
  const refreshed=await readThroughSharedToiletCache({bucket,toiletId:11,fetchOrigin:async()=>{calls++;return detail(11,'갱신됨')},now:()=>30*86_400_000+1001})
  assert.equal(refreshed.name,'갱신됨');assert.equal(calls,1)

  const staleBucket=new FakeR2()
  await readThroughSharedToiletCache({bucket:staleBucket,toiletId:15,fetchOrigin:async()=>detail(15),now:()=>1000})
  const stale=await readThroughSharedToiletCache({bucket:staleBucket,toiletId:15,fetchOrigin:async()=>{throw new Error('origin down')},now:()=>31*86_400_000+1000})
  assert.equal(stale.name,'공개 화장실')
  await assert.rejects(()=>readThroughSharedToiletCache({bucket:staleBucket,toiletId:15,fetchOrigin:async()=>{throw new Error('origin down')},now:()=>37*86_400_000+1001}),/origin down/)
})

test('the 30-day policy adopts valid objects written by the former one-hour policy',async()=>{
  const bucket=new FakeR2();let calls=0
  await bucket.put(sharedToiletCacheKey(14),JSON.stringify({schema:SHARED_TOILET_CACHE_SCHEMA,toiletId:14,revision:0,state:'data',storedAt:1000,
    freshUntil:3_601_000,staleUntil:21_601_000,data:detail(14,'기존 캐시')}))
  const value=await readThroughSharedToiletCache({bucket,toiletId:14,fetchOrigin:async()=>{calls++;return detail(14,'원본')},now:()=>2*86_400_000+1000})
  assert.equal(value.name,'기존 캐시');assert.equal(calls,0)
})

test('maintenance refresh replaces fresh data in the same key and renews storedAt',async()=>{
  const bucket=new FakeR2()
  await readThroughSharedToiletCache({bucket,toiletId:16,fetchOrigin:async()=>detail(16,'이전'),now:()=>1000})
  const refreshed=await refreshSharedToiletCache({bucket,toiletId:16,fetchOrigin:async()=>detail(16,'최신'),now:()=>2000})
  assert.equal(refreshed.state,'data');assert.equal(refreshed.storedAt,2000);assert.equal(bucket.value(16).data.name,'최신')
  assert.equal(bucket.objects.size,1)
})

test('maintenance refresh cannot overwrite a concurrent newer deletion',async()=>{
  const bucket=new FakeR2()
  await applySharedToiletInvalidation(bucket,{toiletId:17,revision:1,action:'UPSERT',catalogChanged:false},()=>1000)
  let calls=0
  const refreshed=await refreshSharedToiletCache({bucket,toiletId:17,now:()=>3000,fetchOrigin:async()=>{
    calls++;await applySharedToiletInvalidation(bucket,{toiletId:17,revision:2,action:'DELETE',catalogChanged:true},()=>2000)
    return detail(17,'삭제 전 응답')
  }})
  assert.equal(calls,1);assert.equal(refreshed.state,'deleted');assert.equal(bucket.value(17).revision,2)
})

test('initial writes use a structured create-only condition',async()=>{
  const bucket=new FakeR2()
  await readThroughSharedToiletCache({bucket,toiletId:12,fetchOrigin:async()=>detail(12)})
  assert.deepEqual(bucket.objects.get(sharedToiletCacheKey(12)).options.onlyIf,{etagDoesNotMatch:'*'})
})

test('persistent cache contention fails open to the public origin',async()=>{
  const bucket={get:async()=>null,put:async()=>null}; let calls=0
  const value=await readThroughSharedToiletCache({bucket,toiletId:13,fetchOrigin:async()=>{calls++;return detail(13)}})
  assert.equal(value.name,'공개 화장실')
  assert.equal(calls,4)
})

test('a shared-cache miss keeps the ISR detail route static-compatible',()=>{
  const source=readFileSync(new URL('../src/server/toilets.ts',import.meta.url),'utf8')
  assert.doesNotMatch(source,/cache:\s*['"]no-store['"]/, 'detail origin must not make the ISR route dynamic')
  assert.match(source,/next:\s*\{\s*revalidate:\s*2_592_000,\s*tags:\s*\[`toilet:\$\{id\}`\]/)
})
