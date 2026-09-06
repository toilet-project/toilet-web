import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createVersionCheck, parseMapResume, readMapResume, saveMapResume, MAP_RESUME_KEY, RESUME_TTL, UPDATE_CHECK_INTERVAL, validAppVersion } from '../src/lib/appUpdate.ts'
import { GET } from '../src/app/version.json/route.ts'

const snapshot = () => ({ path: '/toilet/42', center: {latitude:36.35,longitude:127.38}, level: 4,
  reference: {latitude:36.4,longitude:127.3}, source: 'point', currentLocation: null, expanded: false, savedAt: Date.now() })
test('resume preserves independently selected map center/reference, zoom and card expansion', () => {
  const v = {...snapshot(), expanded: true}
  assert.deepEqual(parseMapResume(JSON.stringify(v), v.path), v)
  assert.notDeepEqual(v.center, v.reference)
  const gps = {...v, source:'current-location', currentLocation:{latitude:36.2,longitude:127.4}}
  assert.deepEqual(parseMapResume(JSON.stringify(gps), gps.path), gps)
})
test('resume rejects invalid, stale, future, different-path or non-map state', () => {
  const v = snapshot()
  for (const bad of [null, {}, {...v,level:0}, {...v,level:99}, {...v,source:'unknown'}, {...v,reference:{latitude:100,longitude:127}}, {...v,currentLocation:{}}, {...v,savedAt:v.savedAt-RESUME_TTL-1}, {...v,savedAt:v.savedAt+1000}]) {
    assert.equal(parseMapResume(JSON.stringify(bad),v.path,v.savedAt),null)
  }
  assert.equal(parseMapResume(JSON.stringify(v),'/toilet/43'),null)
  assert.equal(parseMapResume('{', v.path),null)
  assert.equal(parseMapResume(JSON.stringify({...v,path:'https://evil.test'}),'https://evil.test'),null)
})
test('resume allowlists fields; no auth data or blanket storage clearing', () => {
  const v = snapshot(), entries = new Map([['login','keep']])
  const store = {getItem:k=>entries.get(k)??null, setItem:(k,v)=>entries.set(k,v), removeItem:k=>entries.delete(k)}
  assert.ok(saveMapResume(store,{...v,token:'never-save',reference:{...v.reference,email:'never-save'}}))
  assert.doesNotMatch(entries.get(MAP_RESUME_KEY),/never-save|token|email/)
  assert.deepEqual(readMapResume(store,v.path),v)
  assert.equal(readMapResume(store,'/'),null)
  assert.equal(entries.get('login'),'keep')
  const unavailable = {getItem(){throw Error()},setItem(){throw Error()},removeItem(){throw Error()}}
  assert.equal(readMapResume(unavailable,v.path),null)
  assert.equal(saveMapResume(unavailable,v),false)
})
test('version check detects changes once per interval, ignores same version and disables dev', async () => {
  let now=0, calls=0, version='build-a'; const notices=[]
  const request=async (url,options)=>{
    calls++; assert.equal(url,'/version.json'); assert.equal(options.cache,'no-store'); assert.equal(options.credentials,'omit')
    return Response.json({version})
  }
  const checker=createVersionCheck('build-a',v=>notices.push(v),request,()=>now)
  await checker.check(); version='build-b'; await checker.check()
  assert.equal(calls,1); assert.deepEqual(notices,[])
  now+=UPDATE_CHECK_INTERVAL; await checker.check(); assert.deepEqual(notices,['build-b'])
  checker.dispose(); now+=UPDATE_CHECK_INTERVAL; await checker.check(); assert.equal(calls,2)
  await createVersionCheck('development',()=>assert.fail(),request).check(); assert.equal(calls,2)
})
test('network failure, bad JSON, missing/invalid version and unsuccessful responses never notify', async () => {
  for (const request of [async()=>{throw Error('offline')},async()=>new Response('bad'),async()=>Response.json({version:'<html>'}),async()=>Response.json({}),async()=>new Response('oops',{status:503})]) {
    await createVersionCheck('build-a',()=>assert.fail('must not offer update'),request).check()
  }
  assert.equal(validAppVersion('development'),false)
  assert.equal(validAppVersion('x'.repeat(161)),false)
})
test('parallel focus events share one request and unmount suppresses stale response', async () => {
  let resolve, calls=0
  const pending=new Promise(r=>{resolve=r})
  const checker=createVersionCheck('build-a',()=>assert.fail(),()=>{calls++;return pending})
  const first=checker.check(); await checker.check(); assert.equal(calls,1)
  checker.dispose(); resolve(Response.json({version:'build-b'})); await first
})
test('version endpoint disables browser and CDN caching', async () => {
  const response=GET()
  for (const header of ['Cache-Control','CDN-Cache-Control','Cloudflare-CDN-Cache-Control']) assert.match(response.headers.get(header),/no-store/)
  assert.equal(typeof (await response.json()).version,'string')
})
test('styles load once at root in deterministic order and reload requires explicit guarded click', async () => {
  const source=async path=>readFile(new URL(path,import.meta.url),'utf8')
  const layout=await source('../src/app/layout.tsx'),app=await source('../src/App.tsx'),notice=await source('../src/components/AppUpdateNotice.tsx')
  assert.ok(layout.indexOf("import '../App.css'")<layout.indexOf("import '../components/mobile-navigation.css'"))
  assert.doesNotMatch(app,/import '\.\/components\/mobile-navigation.css'/)
  assert.match(notice,/disabled=\{blocked\}/)
  assert.match(notice,/onClick=\{\(\) => \{[\s\S]*beforeReload\(\)[\s\S]*window.location.reload\(\)/)
  assert.doesNotMatch(notice,/localStorage.clear|sessionStorage.clear|caches.delete/)
  assert.match(app,/!initialRouteRef.current.detail && !resume/)
})
