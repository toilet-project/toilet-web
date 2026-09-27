import test from 'node:test'
import assert from 'node:assert/strict'
import { withToiletDetailTag } from '../detail-cache-tags.ts'

test('legacy and canonical HTML gain one facility tag in every supported locale', () => {
  const value = { type:'app', html:'<html/>', rsc:'flight', revalidate:2592000,
    meta:{ status:200,headers:{'x-next-cache-tags':'_N_T_/layout,toilet:13448','content-type':'text/html'} } }
  for(const prefix of ['', 'en/', 'ja/', 'zh-cn/', 'zh-tw/', 'zh-hk/']) {
    for(const path of [`${prefix}toilet/13448`,`${prefix}regions/대전-30/유성-30200/toilet/13448-name`]) {
      const tagged=withToiletDetailTag(path,value)
      assert.equal(tagged.meta.headers['x-next-cache-tags'],'_N_T_/layout,toilet:13448')
      assert.equal(tagged.html,value.html);assert.equal(tagged.rsc,value.rsc);assert.equal(tagged.revalidate,2592000)
      assert.notEqual(tagged,value);assert.notEqual(tagged.meta.headers,value.meta.headers)
    }
  }
})
test('previously saved R2-hit HTML without an origin-fetch tag is protected on read',()=>{
  const value={type:'app',html:'old stored page',meta:{headers:{'x-next-cache-tags':'_N_T_/layout'}}}
  const tagged=withToiletDetailTag('/en/regions/daejeon-30/yuseong-gu-30200/toilet/13448-station',value)
  assert.equal(tagged.meta.headers['x-next-cache-tags'],'_N_T_/layout,toilet:13448')
  assert.equal(value.meta.headers['x-next-cache-tags'],'_N_T_/layout')
})
test('private routes, unrelated pages, malformed IDs and data cache entries are untouched',()=>{
  const value={type:'app',html:'unchanged'}
  for(const path of ['/admin/toilet/1','/api/public/toilets/1','/my','/regions/daejeon-30',
    '/toilet/0','/toilet/9007199254740992','/toilet/1/extra','/fr/toilet/1']) assert.equal(withToiletDetailTag(path,value),value)
  const data={kind:'FETCH',data:{id:1}}
  assert.equal(withToiletDetailTag('/toilet/1',data),data)
})
