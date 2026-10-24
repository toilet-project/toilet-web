import assert from 'node:assert/strict'
import test from 'node:test'
import {parseCleanupArguments,runIncrementalCacheCleanup} from '../scripts/cache/cleanup-runner-lib.mjs'
import {planIncrementalCacheCleanup,selectAutomaticCleanupBatch,validateActiveReleaseRegistry,
  validateReleaseRegistry} from '../scripts/cache/cleanup-lib.mjs'

const active='11111111-1111-4111-8111-111111111111'
const previous='22222222-2222-4222-8222-222222222222'
const retired='33333333-3333-4333-8333-333333333333'
const staged='44444444-4444-4444-8444-444444444444'
const now=()=>Date.parse('2026-10-24T00:00:00Z')
const releases=[
  {schema:1,workerVersion:retired,appVersion:'retired',deployedAt:'2026-10-01T00:00:00Z'},
  {schema:1,workerVersion:previous,appVersion:'previous',deployedAt:'2026-10-10T00:00:00Z'},
  {schema:1,workerVersion:active,appVersion:'active',deployedAt:'2026-10-20T00:00:00Z'},
]
const snapshot={workerName:'geupddong-web-production',activeWorkerVersions:[active]}
const baseArgs={registry:'registry.json',report:'report.json','rollback-days':'0'}
const baseEnv={R2_INCREMENTAL_CACHE_BUCKET:'geupddong-next-production-cache',CACHE_CLEANUP_ENABLED:'true',CACHE_CLEANUP_AUTOMATIC_ENABLED:'true'}
const oldObject={key:'incremental-cache/retired/a.cache',size:30}
const secretError=()=>Object.assign(new Error('PRIVATE_TOKEN https://private.invalid/?signature=PRIVATE_TOKEN'),
  {stderr:'PRIVATE_TOKEN',code:'PRIVATE_TOKEN',cleanupCode:'PRIVATE_TOKEN'})

function reviewedArgs(objects,{automatic=true,maxFiles='100000',maxBytes='4294967296',registry=releases}={}){
  const full=planIncrementalCacheCleanup({objects,releases:registry,activeWorkerVersions:[active],now:now(),rollbackProtectionDays:automatic?0:3})
  const plan=automatic?selectAutomaticCleanupBatch(full,{maxFiles,maxBytes}):full
  return {...baseArgs,execute:true,...(automatic?{automatic:true,'max-delete-files':maxFiles,'max-delete-bytes':maxBytes}:{'rollback-days':'3'}),
    'expected-delete-files':String(plan.summary.delete.files),'expected-delete-bytes':String(plan.summary.delete.bytes),
    'expected-delete-fingerprint':plan.deleteFingerprint}
}

function fixture({args=baseArgs,objects=[oldObject],registry=releases,statuses=[snapshot],statusError,
  registryError,listError,deleteImpl,writeImpl}={}){
  const events=[],reports=[],progress=[],deleted=[]
  let statusIndex=0
  const dependencies={args,env:baseEnv,now,
    getDeploymentStatus:async()=>{events.push('status');if(statusError)throw statusError;return statuses[Math.min(statusIndex++,statuses.length-1)]},
    readRegistry:async()=>{events.push('registry');if(registryError)throw registryError;return registry},
    createStore:()=>{
      events.push('store')
      return {
        list:async prefix=>{events.push('list');assert.equal(prefix,'incremental-cache/');if(listError)throw listError;return objects},
        delete:async(keys,callbacks)=>{
          events.push('delete');deleted.push(...keys)
          if(deleteImpl)return deleteImpl(keys,callbacks)
          for(let offset=0;offset<keys.length;offset+=1000){
            await callbacks.beforeBatch({offset,batchFiles:Math.min(1000,keys.length-offset),totalFiles:keys.length})
            callbacks.onBatch({deletedFiles:Math.min(offset+1000,keys.length),totalFiles:keys.length})
          }
        },
      }
    },
    writeReport:async value=>{if(writeImpl)await writeImpl(value);reports.push(value)},
    onProgress:value=>progress.push(value),
  }
  return {events,reports,progress,deleted,run:()=>runIncrementalCacheCleanup(dependencies)}
}

test('missing active registration produces an unknown-inventory failure before constructing or listing R2',async()=>{
  const f=fixture({registry:releases.slice(0,2)})
  const result=await f.run()
  assert.deepEqual(f.events,['status','registry'])
  assert.equal(result.status,'failed')
  assert.deepEqual(result.failure,{stage:'registry-validation',code:'active-release-missing'})
  assert.deepEqual(result.inventory,{available:false,files:null,bytes:null})
  assert.equal(result.summary,null);assert.equal(result.deleteObjects,null);assert.equal(result.deleteFingerprint,null)
  assert.equal(result.execution.attempted,false);assert.equal(result.execution.deletedFiles,0)
  assert.equal(f.reports.at(-1).failure.code,'active-release-missing')
})

test('registry validation is reusable, immutable, and retains legacy releases while rejecting duplicate registrations',()=>{
  const frozen=releases.map(release=>Object.freeze({...release}))
  const normalized=validateActiveReleaseRegistry(Object.freeze(frozen),[active])
  assert.equal(normalized.at(-1).cacheNamespace,'active')
  assert.equal(frozen.at(-1).cacheNamespace,undefined)
  assert.throws(()=>validateReleaseRegistry([...releases,{...releases[0]}]),error=>error.code==='registry-namespace-duplicate')
  assert.throws(()=>validateActiveReleaseRegistry(releases,[]),error=>error.code==='active-versions-invalid')
  assert.throws(()=>validateReleaseRegistry([{...releases[0],lifecycle:'staging-typo'}]),error=>error.code==='registry-release-unverified')
})

test('malformed registry fails before any R2 inventory read',async()=>{
  const f=fixture({registry:[{schema:1,appVersion:'invalid'}]})
  const result=await f.run()
  assert.equal(result.failure.code,'registry-entry-invalid')
  assert.deepEqual(f.events,['status','registry'])
})

test('staged candidates never displace the actual immediate rollback release or set its retirement time',()=>{
  const candidate={schema:1,workerVersion:staged,appVersion:'staged',lifecycle:'staged',deployedAt:'2026-10-19T00:00:00Z'}
  const plan=planIncrementalCacheCleanup({objects:[oldObject,{key:'incremental-cache/previous/a.cache',size:40},
    {key:'incremental-cache/staged/a.cache',size:50}],releases:[...releases,candidate],activeWorkerVersions:[active],now:now(),rollbackProtectionDays:0})
  assert.deepEqual(plan.deleteObjects.map(row=>row.key),[oldObject.key])
  assert.equal(plan.protectedCacheNamespaces.previous,'immediate rollback release')
  assert.equal(plan.protectedCacheNamespaces.staged,'staged deployment candidate')
  const onlyStagedLater=[releases[0],{...candidate,deployedAt:'2026-10-23T00:00:00Z'}]
  const protectedPlan=planIncrementalCacheCleanup({objects:[{key:'incremental-cache/staged/a.cache',size:50}],
    releases:onlyStagedLater,activeWorkerVersions:[retired],now:now(),rollbackProtectionDays:0})
  assert.equal(protectedPlan.summary.delete.files,0)
  const retirementPlan=planIncrementalCacheCleanup({objects:[oldObject],releases:[...releases,{...candidate,deployedAt:'2026-10-05T00:00:00Z'}],
    activeWorkerVersions:[active],now:Date.parse('2026-10-22T00:00:00Z'),rollbackProtectionDays:14})
  assert.equal(retirementPlan.protectedCacheNamespaces.retired,'retirement protection until 2026-10-24T00:00:00.000Z')
  assert.equal(retirementPlan.summary.delete.files,0)
})

test('a staged active Worker requires finalized registration and fails before listing R2',async()=>{
  const f=fixture({registry:releases.map(release=>release.workerVersion===active?{...release,lifecycle:'staged'}:release)})
  const result=await f.run()
  assert.deepEqual(result.failure,{stage:'registry-validation',code:'REGISTRY_ACTIVE_NOT_FINALIZED'})
  assert.deepEqual(f.events,['status','registry'])
})

for(const [stage,option,expectedEvents] of [
  ['active-status','statusError',['status']],
  ['registry-read','registryError',['status','registry']],
  ['inventory','listError',['status','registry','store','list']],
]){
  test(`${stage} failures persist fixed codes and never expose raw error fields`,async()=>{
    const f=fixture({[option]:secretError()})
    const result=await f.run()
    assert.equal(result.status,'failed');assert.equal(result.failure.stage,stage)
    assert.deepEqual(f.events,expectedEvents)
    assert.equal(result.summary,null);assert.equal(result.inventory.files,null)
    assert.doesNotMatch(JSON.stringify([result,f.reports,f.progress]),/PRIVATE_TOKEN|private\.invalid|signature=/)
  })
}

test('invalid inventory sizes fail planning without reporting a measured zero-byte bucket',async()=>{
  const f=fixture({objects:[{key:oldObject.key,size:'invalid'}]})
  const result=await f.run()
  assert.deepEqual(result.failure,{stage:'plan',code:'plan-failed'})
  assert.deepEqual(result.inventory,{available:true,files:1,bytes:null})
  assert.equal(result.summary,null);assert.equal(f.deleted.length,0)
})

test('dry-run preserves the complete plan contract without calling delete',async()=>{
  const objects=[oldObject,{key:'incremental-cache/active/a.cache',size:10},{key:'incremental-cache/previous/a.cache',size:20},
    {key:'incremental-cache/unregistered/a.cache',size:40},{key:'public-toilets/v1/toilets/1.json',size:50}]
  const f=fixture({objects})
  const result=await f.run()
  const expected=planIncrementalCacheCleanup({objects,releases,activeWorkerVersions:[active],rollbackProtectionDays:0,now:now()})
  assert.equal(result.status,'completed');assert.equal(result.mode,'dry-run')
  assert.deepEqual(result.summary,expected.summary);assert.equal(result.deleteFingerprint,expected.deleteFingerprint)
  assert.deepEqual(result.protectedCacheNamespaces,expected.protectedCacheNamespaces)
  assert.deepEqual(result.inventory,{available:true,files:5,bytes:150})
  assert.equal(f.deleted.length,0);assert.equal(result.execution.attempted,false)
})

test('automatic execution respects limits and keeps active, rollback, unknown, and shared objects untouched',async()=>{
  const objects=[oldObject,{key:'incremental-cache/retired/b.cache',size:20},{key:'incremental-cache/active/a.cache',size:10},
    {key:'incremental-cache/previous/a.cache',size:10},{key:'incremental-cache/unknown/a.cache',size:5},
    {key:'toilet-content/v1/ko/1.json',size:50}]
  const args=reviewedArgs(objects,{maxFiles:'1',maxBytes:'35'})
  const f=fixture({args,objects}),result=await f.run()
  assert.equal(result.status,'completed');assert.deepEqual(f.deleted,[oldObject.key])
  assert.deepEqual(result.summary.delete,{files:1,bytes:30})
  assert.deepEqual(result.automaticBatch.deferred,{files:1,bytes:20})
  assert.equal(result.summary.unknown.files,2)
  assert.equal(result.execution.deletedFiles,1);assert.equal(result.execution.deletedBytes,30)
  assert.equal(result.execution.deletedFilesExact,true);assert.equal(result.execution.deletedBytesExact,true)
  assert.equal(f.events.filter(event=>event==='status').length,3)
  const inProgress=f.reports.find(report=>report.status==='running'&&report.execution.attempted)
  assert.equal(inProgress.execution.deletedFilesExact,false)
  assert.equal(inProgress.execution.deletionOutcomeUnknown,true)
})

test('review mismatch and manual unknown-object guards still prevent every deletion',async()=>{
  for(const field of ['expected-delete-files','expected-delete-bytes','expected-delete-fingerprint']){
    const args={...reviewedArgs([oldObject]),[field]:field.endsWith('fingerprint')?'0'.repeat(64):'99'}
    const f=fixture({args}),result=await f.run()
    assert.deepEqual(result.failure,{stage:'review',code:'review-rejected'})
    assert.equal(f.deleted.length,0);assert.equal(result.execution.attempted,false)
  }
  const objects=[oldObject,{key:'incremental-cache/unknown/a.cache',size:5}]
  const f=fixture({args:reviewedArgs(objects,{automatic:false}),objects}),result=await f.run()
  assert.equal(result.failure.code,'review-rejected');assert.equal(f.deleted.length,0)
})

test('a deployment change after planning prevents the delete call',async()=>{
  const f=fixture({args:reviewedArgs([oldObject]),statuses:[snapshot,{...snapshot,activeWorkerVersions:[previous]}]})
  const result=await f.run()
  assert.deepEqual(result.failure,{stage:'deployment-check',code:'active-deployment-changed'})
  assert.equal(result.execution.attempted,false);assert.equal(f.deleted.length,0)
})

test('deployment changes at the 10,000-object check stop later requests with exact confirmed totals',async()=>{
  const objects=Array.from({length:10_001},(_,index)=>({key:`incremental-cache/retired/${String(index).padStart(5,'0')}.cache`,size:2}))
  const f=fixture({objects,args:reviewedArgs(objects),statuses:[snapshot,snapshot,snapshot,{...snapshot,activeWorkerVersions:[previous]}]})
  const result=await f.run()
  assert.deepEqual(result.failure,{stage:'delete',code:'active-deployment-changed'})
  assert.equal(result.execution.deletedFiles,10_000);assert.equal(result.execution.deletedBytes,20_000)
  assert.equal(result.execution.deletedFilesExact,true);assert.equal(result.execution.deletionOutcomeUnknown,false)
})

test('an unacknowledged second batch keeps confirmed deletion lower bounds and marks the remainder unknown',async()=>{
  const objects=Array.from({length:1001},(_,index)=>({key:`incremental-cache/retired/${index}.cache`,size:2}))
  const f=fixture({objects,args:reviewedArgs(objects),deleteImpl:async(keys,{beforeBatch,onBatch})=>{
    await beforeBatch({offset:0});onBatch({deletedFiles:1000,totalFiles:keys.length})
    await beforeBatch({offset:1000});throw secretError()
  }})
  const result=await f.run()
  assert.deepEqual(result.failure,{stage:'delete',code:'delete-failed'})
  assert.equal(result.execution.deletedFiles,1000);assert.equal(result.execution.deletedBytes,2000)
  assert.equal(result.execution.deletedFilesExact,false);assert.equal(result.execution.deletedBytesExact,false)
  assert.equal(result.execution.deletionOutcomeUnknown,true)
  assert.doesNotMatch(JSON.stringify([result,f.reports,f.progress]),/PRIVATE_TOKEN|private\.invalid/)
})

test('a first pre-batch deployment failure reports an exact zero without claiming a request was sent',async()=>{
  const f=fixture({args:reviewedArgs([oldObject]),statuses:[snapshot,snapshot,{...snapshot,activeWorkerVersions:[previous]}]})
  const result=await f.run()
  assert.equal(result.failure.code,'active-deployment-changed')
  assert.equal(result.execution.deletedFiles,0);assert.equal(result.execution.deletedFilesExact,true)
  assert.equal(result.execution.deletionOutcomeUnknown,false)
})

test('report destination failures fail closed before any network or deletion and expose only a fixed code',async()=>{
  const f=fixture({writeImpl:async()=>{throw secretError()}})
  const result=await f.run()
  assert.deepEqual(result.failure,{stage:'report',code:'report-write-failed'})
  assert.equal(result.reportWriteFailure,'report-write-failed');assert.deepEqual(f.events,[])
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_TOKEN|private\.invalid/)
})

test('existing CLI flags parse unchanged and invalid execution gates still produce a failure report',async()=>{
  assert.deepEqual(parseCleanupArguments(['--registry','r.json','--report','p.json','--rollback-days','0','--execute','--automatic']),
    {registry:'r.json',report:'p.json','rollback-days':'0',execute:true,automatic:true})
  const f=fixture({args:{...baseArgs,execute:true}})
  const result=await f.run()
  assert.equal(result.failure.code,'configuration-invalid');assert.deepEqual(f.events,[])
  assert.equal(f.reports.at(-1).status,'failed')
})
