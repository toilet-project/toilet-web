import test from 'node:test'
import assert from 'node:assert/strict'
import { placeData, safeJsonLd, sitemapXml, validateSitemapIds, robotsPolicy, MAX_SHARD, toiletMetadataText } from '../src/lib/seo.ts'

const detail = {id:1,name:'검증 화장실',roadAddress:'대전광역시 유성구 검증로 1',jibunAddress:'검증동 2',latitude:36.3,longitude:127.3,region:{sidoName:'대전광역시',sigunguName:'유성구'}}

test('metadata identifies a building as a toilet without altering its source name', () => {
  const source = {...detail, name:'공학1호관'}
  const original = structuredClone(source)
  assert.deepEqual(toiletMetadataText(source), {
    title:'공학1호관 화장실 위치 및 이용정보 | 대전광역시 유성구',
    description:'대전광역시 유성구에 위치한 공학1호관 화장실의 위치, 개방시간과 시설 정보를 확인하세요.',
  })
  assert.deepEqual(source, original)
  assert.equal(placeData(source).name, '공학1호관')
})
test('metadata does not duplicate an existing toilet term anywhere in the name', () => {
  for (const name of ['공중화장실', '공학1호관 화장실', '화장실 (남)', '공학1호관 화 장 실']) {
    assert.equal(toiletMetadataText({...detail,name}).title, `${name} 위치 및 이용정보 | 대전광역시 유성구`)
  }
})
test('metadata handles missing region and trims names without inventing a location', () => {
  assert.deepEqual(toiletMetadataText({...detail,name:' 검증관 ',region:null}), {
    title:'검증관 화장실 위치 및 이용정보',
    description:'검증관 화장실의 위치, 개방시간과 시설 정보를 확인하세요.',
  })
  assert.equal(toiletMetadataText({...detail,name:' '}).title, '화장실 위치 및 이용정보 | 대전광역시 유성구')
})
test('Place uses actual preferred address, validated region and coordinates',()=>{
  const data=placeData(detail)
  assert.equal(data['@type'],'Place')
  assert.equal(data.address.streetAddress,detail.roadAddress)
  assert.equal(data.address.addressLocality,'유성구')
  assert.equal(data.geo.latitude,36.3)
  assert.equal(data.url,'https://geupddong.com/toilet/1')
  assert.equal('openingHours' in data,false)
})
test('jibun fallback; no inferred region, missing/invalid coordinates omitted',()=>{
  const data=placeData({...detail,roadAddress:' ',region:null,latitude:null})
  assert.equal(data.address.streetAddress,'검증동 2')
  assert.equal('addressRegion' in data.address,false)
  assert.equal('geo' in data,false)
  assert.equal('geo' in placeData({...detail,latitude:91}),false)
  assert.equal('address' in placeData({...detail,roadAddress:'',jibunAddress:''}),false)
})
test('city/district and Sejong are kept without invented levels',()=>{
  const region={sidoName:'충청남도',sigunguName:'천안시 서북구'}
  assert.equal(placeData({...detail,region}).address.addressLocality,'천안시 서북구')
  const data=placeData({...detail,region:{sidoName:'세종특별자치시',sigunguName:null}})
  assert.equal('addressLocality' in data.address,false)
})
test('JSON-LD cannot close its script tag',()=>{
  const name='</script><script>alert("x")</script>\u2028\u2029'
  const encoded=safeJsonLd(placeData({...detail,name}))
  assert.doesNotMatch(encoded,/[<\u2028\u2029]/)
  assert.equal(JSON.parse(encoded).name,name)
})
test('sitemap validates ordered bounded IDs and fixed shard boundaries',()=>{
  assert.deepEqual(validateSitemapIds([1,10000],0),[1,10000])
  assert.deepEqual(validateSitemapIds([10001,20000],1),[10001,20000])
  assert.deepEqual(validateSitemapIds([Number.MAX_SAFE_INTEGER],MAX_SHARD),[Number.MAX_SAFE_INTEGER])
  for(const ids of [[0],[10001],[1,1],[3,2],['1'],[null]]) assert.throws(()=>validateSitemapIds(ids,0))
  assert.throws(()=>validateSitemapIds(Array(10001).fill(1),0))
  assert.deepEqual(validateSitemapIds([0,2,90]),[0,2,90])
  assert.throws(()=>validateSitemapIds([MAX_SHARD+1]))
})
test('10000 URLs stay below XML limits; no invented lastmod or region URLs',()=>{
  const xml=sitemapXml(Array.from({length:10000},(_,i)=>`/toilet/${i+1}`))
  assert.equal((xml.match(/<url>/g)||[]).length,10000)
  assert.ok(Buffer.byteLength(xml)<52_428_800)
  assert.doesNotMatch(xml,/lastmod|region/)
  assert.match(sitemapXml(['/a?x=1&y=<x>']),/&amp;y=&lt;x&gt;/)
  assert.match(sitemapXml(['/sitemaps/0.xml'],true),/<sitemapindex/)
})
test('production allows toilets; preview blocks crawling without advertising sitemap',()=>{
  const production=robotsPolicy(true),preview=robotsPolicy(false)
  assert.equal(production.rules.allow,'/')
  assert.ok(!production.rules.disallow.some(path=>'/toilet/1'.startsWith(path)))
  assert.equal(preview.rules.disallow,'/')
  assert.equal('sitemap' in preview,false)
})
