import assert from 'node:assert/strict'
import test from 'node:test'
import {applySharedToiletInvalidation,readThroughSharedToiletCache,SHARED_TOILET_CACHE_SCHEMA,sharedToiletCacheKey} from '../src/server/sharedToiletCache.ts'

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

test('bounded stale positive data is used only when an origin refresh fails',async()=>{
  const bucket=new FakeR2()
  await readThroughSharedToiletCache({bucket,toiletId:11,fetchOrigin:async()=>detail(11),now:()=>1000})
  const stale=await readThroughSharedToiletCache({bucket,toiletId:11,fetchOrigin:async()=>{throw new Error('origin down')},now:()=>3_602_000})
  assert.equal(stale.name,'공개 화장실')
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
