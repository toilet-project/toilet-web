import assert from 'node:assert/strict'
import test from 'node:test'
import {registerHooks} from 'node:module'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {parseFragment} from 'parse5'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'

const hooks=registerHooks({
  resolve(specifier,context,next){
    if(specifier==='next/link')return next('next/link.js',context)
    try{return next(specifier,context)}catch(error){
      if(error.code==='ERR_MODULE_NOT_FOUND'&&specifier.startsWith('.')){
        for(const extension of ['.ts','.tsx'])try{return next(specifier+extension,context)}catch{}
      }
      throw error
    }
  },
  load(url,context,next){
    if(url.endsWith('.tsx'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),
      {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true}
    return next(url,context)
  },
})
const {detailPresentation}=await import('../src/lib/detailPresentation.ts')
const {reuseDetailFragment,loadDetailFragment,detailFragmentKey}=await import('../src/server/detailFragmentCache.ts')
const {renderDetailFragment}=await import('../src/server/detailFragmentTemplate.ts')
const {ToiletDetailContents}=await import('../src/components/ToiletDetailContents.tsx')
const {LocaleContext}=await import('../src/i18n/context.ts')
const {SUPPORTED_LOCALES}=await import('../src/i18n/locale.ts')
hooks.deregister()

class Bucket{
  objects=new Map();writes=0
  async get(key){const value=this.objects.get(key);return value?{etag:value.etag,json:async()=>JSON.parse(value.body)}:null}
  async put(key,body,{onlyIf}={}){
    const value=this.objects.get(key)
    if(onlyIf?.etagDoesNotMatch==='*'&&value||onlyIf?.etagMatches&&value?.etag!==onlyIf.etagMatches)return null
    const etag=String(++this.writes);this.objects.set(key,{etag,body});return {etag}
  }
}
function detail(overrides={}){
  return {id:7,name:'시험 화장실',toiletType:'개방화장실',roadAddress:'서울특별시 종로구 사직로 161',jibunAddress:'세종로',latitude:37.5796,longitude:126.977,
    maleToiletCount:2,maleUrinalCount:1,maleDisabledToiletCount:0,maleDisabledUrinalCount:0,maleChildToiletCount:0,maleChildUrinalCount:0,
    femaleToiletCount:3,femaleDisabledToiletCount:1,femaleChildToiletCount:0,agencyName:'기관',phoneNumber:'0212345678',openTime:'24시간',openTimeDetail:'',
    installationDate:'202609',hasEmergencyBell:'Y',emergencyBellLocation:'입구',hasCctv:'N',hasDiaperTable:'Y',diaperTableLocation:'여자화장실',
    dataBaseDate:'2026-09-27',dataSource:'PUBLIC_DATA',translations:{en:{name:'Test restroom',roadAddress:'161 Sajik-ro, Jongno-gu, Seoul'}},...overrides}
}
const get=async(bucket,model=detailPresentation(detail(),'ko'),options={})=>{
  const id=options.id??7,locale=options.locale??'ko'
  return reuseDetailFragment({bucket,id,locale,model,loaded:await loadDetailFragment(bucket,id,locale),...options})
}
const textOf=node=>node.nodeName==='#text'?node.value:(node.childNodes??[]).map(textOf).join('')
const elements=(node,tag)=>[...(node.tagName===tag?[node]:[]),...(node.childNodes??[]).flatMap(child=>elements(child,tag))]
const attr=(node,name)=>node.attrs.find(a=>a.name===name)?.value

test('same public content survives deployment/chrome changes without another R2 write',async()=>{
  const bucket=new Bucket(),model=detailPresentation(detail(),'ko')
  const first=await get(bucket,model)
  process.env.NEXT_DEPLOYMENT_ID='a-new-header-and-footer-deployment'
  try{
    const next=await get(bucket,detailPresentation(detail({email:'private',profileName:'USER',distance:11,reviewCount:99}),'ko'))
    assert.deepEqual(next,first);assert.equal(bucket.writes,1);assert.equal(bucket.objects.size,1)
    assert.doesNotMatch(bucket.objects.values().next().value.body,/private|USER|NEXT_DEPLOYMENT_ID|_next\/static/)
  }finally{delete process.env.NEXT_DEPLOYMENT_ID}
})

test('facility changes and template changes overwrite one locale slot, leaving other facilities untouched',async()=>{
  const bucket=new Bucket()
  const first=await get(bucket)
  await get(bucket,detailPresentation(detail({id:8}),'ko'),{id:8})
  const other=bucket.objects.get(detailFragmentKey(8,'ko'))
  const changed=await get(bucket,detailPresentation(detail({roadAddress:'새로운 주소'}),'ko'))
  assert.notEqual(changed.fingerprint,first.fingerprint);assert.match(changed.html,/새로운 주소/)
  const template=await get(bucket,detailPresentation(detail({roadAddress:'새로운 주소'}),'ko'),{template:'next-body-template'})
  assert.notEqual(template.fingerprint,changed.fingerprint);assert.equal(bucket.objects.size,2)
  assert.deepEqual(bucket.objects.get(detailFragmentKey(8,'ko')),other)
})

test('language variants and canonical/legacy aliases use only facility and locale identity',async()=>{
  const bucket=new Bucket()
  for(const locale of SUPPORTED_LOCALES){
    const model=detailPresentation(detail(),locale)
    const first=await get(bucket,model,{locale})
    assert.deepEqual(await get(bucket,model,{locale}),first)
  }
  assert.equal(bucket.objects.size,6);assert.equal(bucket.writes,6)
  assert.throws(()=>detailFragmentKey(7,'../../private'))
  assert.throws(()=>detailFragmentKey(-1,'ko'))
})

test('cached HTML matches the interactive public component in all six languages',()=>{
  for(const locale of SUPPORTED_LOCALES){
    const value=detail()
    const html=renderDetailFragment(detailPresentation(value,locale))
    const live=renderToStaticMarkup(React.createElement(LocaleContext.Provider,{value:locale},React.createElement(ToiletDetailContents,{toilet:value})))
    const a=parseFragment(html),b=parseFragment(live)
    assert.equal(textOf(a),textOf(b),locale)
    assert.deepEqual(elements(a,'a').map(n=>decodeURI(attr(n,'href'))),elements(b,'a').map(n=>decodeURI(attr(n,'href'))),locale)
    for(const tag of ['h2','h3','dt','dd','button','details'])assert.equal(elements(a,tag).length,elements(b,tag).length,locale+':'+tag)
  }
})

test('untrusted facility text cannot introduce tags, scripts or executable attributes',()=>{
  const attack='"><img src=x onerror=alert(1)><script>alert(1)</script>'
  const html=renderDetailFragment(detailPresentation(detail({roadAddress:attack,agencyName:attack,phoneNumber:attack,emergencyBellLocation:attack}),'ko'))
  const tree=parseFragment(html)
  assert.equal(elements(tree,'script').length,0);assert.equal(elements(tree,'img').length,0)
  assert.ok(textOf(tree).includes(attack));assert.doesNotMatch(html,/<script|<img/)
  const attributes=node=>[...(node.attrs??[]),...(node.childNodes??[]).flatMap(attributes)]
  assert.ok(attributes(tree).every(attribute=>!attribute.name.startsWith('on')))
})

test('corrupt objects and unavailable storage still return the complete escaped public body',async()=>{
  const bucket=new Bucket(),expected=await get(bucket)
  const key=detailFragmentKey(7,'ko'),record=JSON.parse(bucket.objects.get(key).body)
  record.html='<script>wrong</script>';bucket.objects.set(key,{etag:'broken',body:JSON.stringify(record)})
  assert.deepEqual(await get(bucket),expected)
  const down={get:async()=>{throw Error('down')},put:async()=>{throw Error('down')}}
  assert.deepEqual(await get(down),expected)
  assert.deepEqual(await get(null),expected)
})

test('an in-flight old writer cannot overwrite a newer slot loaded from the same revision',async()=>{
  const bucket=new Bucket()
  await get(bucket)
  const loaded=await loadDetailFragment(bucket,7,'ko')
  const newer=await get(bucket,detailPresentation(detail({roadAddress:'최신 주소'}),'ko'))
  await reuseDetailFragment({bucket,id:7,locale:'ko',loaded,model:detailPresentation(detail({roadAddress:'이전 요청'}),'ko')})
  const after=await get(bucket,detailPresentation(detail({roadAddress:'최신 주소'}),'ko'))
  assert.deepEqual(after,newer);assert.equal(bucket.writes,2)
})
