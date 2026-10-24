import assert from 'node:assert/strict'
import test from 'node:test'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {activateProductionRelease,assertFreshStage,checkedReceipt,checkedRemoteVersion,mergeReleaseRecord,
  parseUploadedVersion,releaseRecord,RELEASE_WORKER} from '../scripts/cache/production-release-lib.mjs'
import {readPublicReleaseVersion} from '../scripts/cache/production-release-lib.mjs'

const uuid=n=>`${String(n).repeat(8)}-${String(n).repeat(4)}-${String(n).repeat(4)}-${String(n).repeat(4)}-${String(n).repeat(12)}`
const previous=uuid(1),active=uuid(2),target=uuid(3)
const manifest={target:'production-candidate',sourceCommit:'c'.repeat(40),buildId:'build-new',appVersion:`${'c'.repeat(40)}-101-1-production-candidate`}
const receipt={schema:1,workerName:RELEASE_WORKER,workerVersion:target,manifestSha256:'a'.repeat(64),artifactSha256:'b'.repeat(64),scriptEtag:'etag-new',createdOn:'2026-10-24T01:00:00Z'}
const entry=(version,run,time)=>({schema:1,workerVersion:version,cacheNamespace:`${'d'.repeat(40)}-${run}-1-production-candidate`,deployedAt:time})
const registry=[entry(previous,99,'2026-10-22T00:00:00Z'),entry(active,100,'2026-10-23T00:00:00Z')]
const initial={id:'deployment-before',created_on:'2026-10-23T00:00:00Z',versions:[{version_id:active,percentage:100}]}
const activated={id:'deployment-after',created_on:'2026-10-24T01:04:00.123Z',versions:[{version_id:target,percentage:100}]}
function fixture(){
  const state={registry:structuredClone(registry),activated:false,writes:[],events:[],statusCalls:0,reports:[]}
  const actions={
    version:async()=>{state.events.push('version');return {id:target,annotations:{'workers/tag':receipt.manifestSha256},resources:{script:{etag:receipt.scriptEtag}},metadata:{created_on:receipt.createdOn}}},
    status:async()=>{state.statusCalls++;state.events.push('status');return state.activated?structuredClone(activated):structuredClone(initial)},
    registry:async()=>{state.events.push('registry');return structuredClone(state.registry)},
    replaceRegistry:async(expected,next)=>{assert.deepEqual(state.registry,expected);state.registry=structuredClone(next);state.writes.push(structuredClone(next));state.events.push('write-registry')},
    activate:async()=>{assert.equal(state.registry.find(row=>row.workerVersion===target).lifecycle,'staged');state.activated=true;state.events.push('activate')},
    publicVersion:async()=>manifest.appVersion,
    dispatch:async()=>{assert.equal(state.registry.find(row=>row.workerVersion===target).lifecycle,'deployed');state.events.push('dispatch')},
  }
  return {state,actions,run:opts=>activateProductionRelease({manifest,receipt,actions,onReport:async row=>state.reports.push(row),...opts})}
}

test('approved activation registers first, confirms actual activation time, then requests bounded cleanup',async()=>{
  const f=fixture(),result=await f.run({execute:true})
  assert.equal(result.status,'completed');assert.equal(result.cleanupRequested,true);assert.equal(result.cleanupCompleted,false)
  assert.equal(f.state.writes.length,2)
  assert.equal(f.state.writes[0].at(-1).lifecycle,'staged')
  assert.equal(f.state.registry.at(-1).deployedAt,activated.created_on)
  assert.equal(f.state.registry.at(-1).lifecycle,'deployed')
  assert.ok(f.state.events.indexOf('write-registry')<f.state.events.indexOf('activate'))
  assert.ok(f.state.events.indexOf('activate')<f.state.events.indexOf('dispatch'))
  assert.deepEqual(f.state.registry.slice(0,2),registry)
})
test('default activation plan makes no remote writes, activation or cleanup request',async()=>{
  const f=fixture(),report=await f.run()
  assert.equal(report.status,'planned');assert.equal(f.state.writes.length,0)
  assert.equal(f.state.activated,false);assert.ok(!f.state.events.includes('dispatch'))
})
test('missing active registration blocks all deployment effects',async()=>{
  const f=fixture();f.state.registry=f.state.registry.slice(0,1)
  await assert.rejects(f.run({execute:true}))
  assert.equal(f.state.writes.length,0);assert.equal(f.state.activated,false)
  assert.equal(f.state.reports.at(-1).stage,'active-registry-check')
})
test('etag or tag mismatch refuses activation before registry mutation',async()=>{
  for(const key of ['etag','tag']){
    const f=fixture(),original=f.actions.version
    f.actions.version=async()=>{const value=await original();if(key==='etag')value.resources.script.etag='other';else value.annotations['workers/tag']='other';return value}
    await assert.rejects(f.run({execute:true}),/STAGED_VERSION_/)
    assert.equal(f.state.writes.length,0)
  }
})
test('a concurrent deployment after preregistration is not overwritten',async()=>{
  const f=fixture(),original=f.actions.status
  f.actions.status=async()=>{const value=await original();return f.state.statusCalls===2?{...value,id:'concurrent-deployment'}:value}
  await assert.rejects(f.run({execute:true}),/DEPLOYMENT_CHANGED_BEFORE_ACTIVATION/)
  assert.equal(f.state.activated,false);assert.equal(f.state.registry.at(-1).lifecycle,'staged')
  assert.ok(!f.state.events.includes('dispatch'))
})
test('finalization failure after activation stays visible and cannot request cleanup',async()=>{
  const f=fixture(),original=f.actions.replaceRegistry
  f.actions.replaceRegistry=async(...args)=>{if(f.state.activated)throw new Error('private stderr');await original(...args)}
  await assert.rejects(f.run({execute:true}),/RELEASE_OPERATION_FAILED/)
  assert.equal(f.state.registry.at(-1).lifecycle,'staged')
  assert.equal(f.state.reports.at(-1).activated,true)
  assert.ok(!JSON.stringify(f.state.reports).includes('private stderr'));assert.ok(!f.state.events.includes('dispatch'))
})
test('public identity mismatch leaves valid finalized registration but suppresses cleanup',async()=>{
  const f=fixture();f.actions.publicVersion=async()=> 'different-release'
  await assert.rejects(f.run({execute:true}),/PUBLIC_VERSION_MISMATCH/)
  assert.equal(f.state.registry.at(-1).lifecycle,'deployed');assert.ok(!f.state.events.includes('dispatch'))
})
test('retry resumes a live staged release after finalization failure without deploying again',async()=>{
  const f=fixture(),original=f.actions.replaceRegistry
  f.actions.replaceRegistry=async(...args)=>{if(f.state.activated)throw new Error('temporary registration failure');await original(...args)}
  await assert.rejects(f.run({execute:true}))
  f.actions.replaceRegistry=original
  const result=await f.run({execute:true})
  assert.equal(result.status,'completed');assert.equal(f.state.registry.at(-1).lifecycle,'deployed')
  assert.equal(f.state.events.filter(value=>value==='activate').length,1)
})
test('retry resumes public checks and dispatch after a dispatch failure without a second activation',async()=>{
  const f=fixture(),original=f.actions.dispatch
  f.actions.dispatch=async()=>{throw new Error('temporary event failure')}
  await assert.rejects(f.run({execute:true}))
  f.actions.dispatch=original
  const result=await f.run({execute:true})
  assert.equal(result.cleanupRequested,true)
  assert.equal(f.state.events.filter(value=>value==='activate').length,1)
  assert.equal(f.state.registry.at(-1).deployedAt,activated.created_on)
})
test('retry after activation response loss finalizes the confirmed active release',async()=>{
  const f=fixture(),original=f.actions.activate
  f.actions.activate=async(...args)=>{await original(...args);throw new Error('transport closed after activation')}
  await assert.rejects(f.run({execute:true}))
  assert.equal(f.state.reports.at(-1).activated,null)
  assert.equal(f.state.reports.at(-1).activationAttempted,true)
  assert.equal(f.state.reports.at(-1).activationOutcome,'unknown')
  f.actions.activate=original
  assert.equal((await f.run({execute:true})).status,'completed')
  assert.equal(f.state.events.filter(value=>value==='activate').length,1)
})
test('an older staged receipt cannot activate after a newer release has already gone live',async()=>{
  const f=fixture()
  f.state.registry[1].cacheNamespace=`${'e'.repeat(40)}-102-1-production-candidate`
  await assert.rejects(f.run({execute:true}),/ARTIFACT_NOT_NEWER_THAN_ACTIVE_RELEASE/)
  assert.equal(f.state.writes.length,0);assert.equal(f.state.activated,false)
})
test('registration is idempotent and cannot rewrite an activated identity/time',()=>{
  const staged=releaseRecord(manifest,receipt)
  const first=mergeReleaseRecord(registry,staged)
  assert.deepEqual(mergeReleaseRecord(first,staged),first)
  const completed=releaseRecord(manifest,receipt,{lifecycle:'deployed',deployedAt:activated.created_on})
  const final=mergeReleaseRecord(first,completed)
  assert.deepEqual(mergeReleaseRecord(final,staged),final)
  assert.throws(()=>mergeReleaseRecord(final,{...completed,deployedAt:'2026-10-25T00:00:00Z'}),/RELEASE_TIME_CONFLICT/)
  assert.throws(()=>mergeReleaseRecord(final,{...completed,workerVersion:uuid(4)}),/CACHE_NAMESPACE_ALREADY_REGISTERED/)
})
test('registry growth beyond the GitHub variable limit refuses registration without dropping history',()=>{
  const original=structuredClone(registry)
  original[0].auditNote='x'.repeat(48*1024)
  assert.throws(()=>mergeReleaseRecord(original,releaseRecord(manifest,receipt)),/REGISTRY_SIZE_LIMIT/)
  assert.equal(original.length,2)
})
test('staging refuses an active/known namespace and stale CI artifacts before cache population',()=>{
  assertFreshStage(manifest,registry,initial)
  assert.throws(()=>assertFreshStage({...manifest,appVersion:registry[1].cacheNamespace},registry,initial),/CACHE_NAMESPACE_ALREADY_REGISTERED/)
  assert.throws(()=>assertFreshStage({...manifest,appVersion:`${manifest.sourceCommit}-98-1-production-candidate`},registry,initial),/ARTIFACT_NOT_NEWER/)
  assert.throws(()=>assertFreshStage(manifest,registry.slice(0,1),initial))
})
test('receipt binds local artifact digest, manifest digest, UUID, remote tag and script etag',()=>{
  checkedReceipt(receipt,receipt)
  assert.throws(()=>checkedReceipt(receipt,{...receipt,artifactSha256:'f'.repeat(64)}),/STAGED_ARTIFACT_CHANGED/)
  assert.throws(()=>checkedReceipt({...receipt,workerName:'other'},receipt),/INVALID_STAGE_RECEIPT/)
  assert.throws(()=>checkedRemoteVersion({id:uuid(4)},receipt),/STAGED_VERSION_IDENTITY_MISMATCH/)
})
test('public release identity follows the deployed version endpoint contract with no cached read',async()=>{
  const value=await readPublicReleaseVersion(async(url,options)=>{
    assert.equal(url,'https://geupddong.com/version.json');assert.equal(options.cache,'no-store')
    return Response.json({version:manifest.appVersion,detailCache:{}})
  })
  assert.equal(value,manifest.appVersion)
  await assert.rejects(readPublicReleaseVersion(async()=>Response.json({appVersion:manifest.appVersion})),/PUBLIC_VERSION_RESPONSE_INVALID/)
  await assert.rejects(readPublicReleaseVersion(async()=>new Response('',{status:503})),/PUBLIC_VERSION_READ_FAILED/)
})
test('upload UUID is extracted only from the unique Wrangler success line',()=>{
  assert.equal(parseUploadedVersion(`binding: ${uuid(5)}\nWorker Version ID: ${target}\n`),target)
  assert.throws(()=>parseUploadedVersion(`binding: ${target}`),/STAGE_VERSION_ID_UNAVAILABLE/)
  assert.throws(()=>parseUploadedVersion(`Worker Version ID: ${target}\nWorker Version ID: ${uuid(4)}\n`),/STAGE_VERSION_ID_UNAVAILABLE/)
})
test('CLI refuses output collisions and preview config forwarding before any remote operation',async()=>{
  const run=promisify(execFile),script=fileURLToPath(new URL('../scripts/production-release.mjs',import.meta.url))
  const root=fileURLToPath(new URL('..',import.meta.url)),outside=join(tmpdir(),'cache-release-collision.json')
  await assert.rejects(run(process.execPath,[script,'activate','--release-dir',root,'--receipt',outside,'--report',outside]),/REPORT_AND_RECEIPT_MUST_DIFFER/)
  await assert.rejects(run(process.execPath,[script,'stage','--release-dir',root,'--report',join(root,'worker-release-manifest.json')]),/REPORT_MUST_BE_OUTSIDE_ARTIFACT/)
  await assert.rejects(run(process.execPath,[fileURLToPath(new URL('../scripts/deploy-preview.mjs',import.meta.url)),'--config','wrangler.production.jsonc']),/Preview deployment accepts no arguments/)
})
