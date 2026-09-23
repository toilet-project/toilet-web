import assert from 'node:assert/strict'
import test from 'node:test'
import {assertAutomaticCleanupPlan,assertReviewedCleanupPlan,cacheNamespaceFromKey,cleanupPlanFingerprint,normalizeDeploymentStatus,planIncrementalCacheCleanup,sameActiveDeployment,selectAutomaticCleanupBatch,selectRetiredNamespaceCleanup} from '../scripts/cache/cleanup-lib.mjs'

const active='11111111-1111-4111-8111-111111111111',previous='22222222-2222-4222-8222-222222222222',old='33333333-3333-4333-8333-333333333333'
const retiredNamespace='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-12345-1-review-production-candidate'
const releases=[
  {schema:1,workerVersion:old,buildId:'next-build-old',appVersion:'cache-old',deployedAt:'2026-09-01T00:00:00.000Z',retiredAt:'2026-09-10T00:00:00.000Z'},
  {schema:1,workerVersion:previous,buildId:'next-build-previous',appVersion:'cache-previous',deployedAt:'2026-09-14T00:00:00.000Z'},
  {schema:1,workerVersion:active,buildId:'next-build-active',appVersion:'cache-active',deployedAt:'2026-09-15T00:00:00.000Z'},
  {schema:1,workerVersion:null,lifecycle:'retired-validation',sourceRunId:12345,cacheNamespace:retiredNamespace,
    deployedAt:'2026-09-13T00:00:00.000Z',retiredAt:'2026-09-13T01:00:00.000Z'},
]
test('only recognized retired builds outside rollback protection are selected',()=>{
  const objects=[
    {key:'incremental-cache/cache-active/a.cache',size:10},{key:'incremental-cache/cache-previous/b.cache',size:20},
    {key:'incremental-cache/cache-old/c.cache',size:30},{key:`incremental-cache/${retiredNamespace}/candidate.cache`,size:35},
    {key:'public-toilets/v1/toilets/1.json',size:40},
    {key:'incremental-cache/unregistered/d.cache',size:50},
  ]
  const plan=planIncrementalCacheCleanup({objects,releases,activeWorkerVersions:[active],now:Date.parse('2026-09-15T12:00:00Z')})
  assert.deepEqual(plan.deleteObjects.map(row=>row.key),['incremental-cache/cache-old/c.cache'])
  assert.equal(plan.protectedObjects.length,3);assert.equal(plan.unknownObjects.length,2);assert.equal(plan.summary.delete.bytes,30)
  assert.equal(plan.deleteFingerprint,cleanupPlanFingerprint([...plan.deleteObjects].reverse()))
  assert.match(plan.deleteFingerprint,/^[a-f0-9]{64}$/)
  assert.deepEqual(plan.protectedCacheNamespaces,{
    'cache-active':'active traffic',
    'cache-previous':'retirement protection until 2026-09-18T00:00:00.000Z',
    [retiredNamespace]:'retirement protection until 2026-09-16T01:00:00.000Z',
  })
})
test('every recently retired namespace keeps its own minimum protection window',()=>{
  const first={schema:1,workerVersion:old,appVersion:'cache-first',deployedAt:'2026-09-12T00:00:00.000Z',retiredAt:'2026-09-14T00:00:00.000Z'}
  const second={schema:1,workerVersion:previous,appVersion:'cache-second',deployedAt:'2026-09-14T00:00:00.000Z',retiredAt:'2026-09-15T00:00:00.000Z'}
  const current={schema:1,workerVersion:active,appVersion:'cache-current',deployedAt:'2026-09-15T00:00:00.000Z'}
  const plan=planIncrementalCacheCleanup({objects:[
    {key:'incremental-cache/cache-first/a.cache',size:10},
    {key:'incremental-cache/cache-second/b.cache',size:20},
    {key:'incremental-cache/cache-current/c.cache',size:30},
  ],releases:[first,second,current],activeWorkerVersions:[active],now:Date.parse('2026-09-16T00:00:00Z')})
  assert.equal(plan.summary.delete.files,0)
  assert.equal(plan.protectedCacheNamespaces['cache-first'],'retirement protection until 2026-09-17T00:00:00.000Z')
  assert.equal(plan.protectedCacheNamespaces['cache-second'],'retirement protection until 2026-09-18T00:00:00.000Z')
})
test('execution requires an exact reviewed plan with no unknown objects',()=>{
  const clean=planIncrementalCacheCleanup({objects:[{key:'incremental-cache/cache-old/c.cache',size:30}],releases,activeWorkerVersions:[active],now:Date.parse('2026-09-19T12:00:00Z')})
  assert.doesNotThrow(()=>assertReviewedCleanupPlan(clean,{files:1,bytes:30,fingerprint:clean.deleteFingerprint}))
  assert.throws(()=>assertReviewedCleanupPlan(clean,{files:2,bytes:30,fingerprint:clean.deleteFingerprint}),/does not match/)
  const unknown=planIncrementalCacheCleanup({objects:[{key:'incremental-cache/unregistered/d.cache',size:50}],releases,activeWorkerVersions:[active]})
  assert.throws(()=>assertReviewedCleanupPlan(unknown,{files:1,bytes:50,fingerprint:cleanupPlanFingerprint(unknown.deleteObjects)}),/unclassified/)
})
test('manual cleanup selects only one older release and keeps active and rollback versions',()=>{
  const plan=planIncrementalCacheCleanup({objects:[
    {key:'incremental-cache/cache-active/a.cache',size:10},
    {key:'incremental-cache/cache-previous/b.cache',size:20},
    {key:'incremental-cache/cache-old/c.cache',size:30},
    {key:'incremental-cache/unregistered/d.cache',size:40},
  ],releases,activeWorkerVersions:[active],now:Date.parse('2026-09-15T12:00:00Z'),rollbackProtectionDays:0})
  const selected=selectRetiredNamespaceCleanup(plan,releases,[active],'cache-old')
  assert.deepEqual(selected.deleteObjects.map(row=>row.key),['incremental-cache/cache-old/c.cache'])
  assert.deepEqual(selected.summary.delete,{files:1,bytes:30})
  assert.equal(selected.unknownObjects.length,0)
  assert.doesNotThrow(()=>assertReviewedCleanupPlan(selected,{files:1,bytes:30,fingerprint:selected.deleteFingerprint}))
  assert.throws(()=>selectRetiredNamespaceCleanup(plan,releases,[active],'cache-active'),/protected/)
  assert.throws(()=>selectRetiredNamespaceCleanup(plan,releases,[active],'cache-previous'),/protected/)
})
test('zero-day automatic policy retains the active and immediately preceding Worker caches',()=>{
  const plan=planIncrementalCacheCleanup({objects:[
    {key:'incremental-cache/cache-active/a.cache',size:10},
    {key:'incremental-cache/cache-previous/b.cache',size:20},
    {key:'incremental-cache/cache-old/c.cache',size:30},
  ],releases,activeWorkerVersions:[active],now:Date.parse('2026-09-15T12:00:00Z'),rollbackProtectionDays:0})
  assert.deepEqual(plan.deleteObjects.map(row=>row.key),['incremental-cache/cache-old/c.cache'])
  assert.equal(plan.protectedCacheNamespaces['cache-active'],'active traffic')
  assert.equal(plan.protectedCacheNamespaces['cache-previous'],'immediate rollback release')
})
test('missing active manifest and ambiguous keys fail closed',()=>{
  assert.throws(()=>planIncrementalCacheCleanup({objects:[],releases,activeWorkerVersions:['44444444-4444-4444-8444-444444444444']}),/missing a release manifest/)
  assert.equal(cacheNamespaceFromKey('incremental-cache/deployment/hash.cache'),'deployment');assert.equal(cacheNamespaceFromKey('other/deployment/hash.cache'),null)
  assert.throws(()=>planIncrementalCacheCleanup({objects:[],releases:[{...releases[0],cacheNamespace:'different'}],activeWorkerVersions:[old]}),/does not match app version/)
  assert.throws(()=>planIncrementalCacheCleanup({objects:[],releases:[{...releases.at(-1),sourceRunId:54321}],activeWorkerVersions:[active]}),/audited retired validation candidate/)
})
test('deployment snapshots normalize traffic and detect a change',()=>{
  const one=normalizeDeploymentStatus({versions:[{version_id:active,percentage:100},{version_id:old,percentage:0}]},'worker')
  const same=normalizeDeploymentStatus({versions:[{version_id:active,percentage:100}]},'worker')
  const changed=normalizeDeploymentStatus({versions:[{version_id:previous,percentage:100}]},'worker')
  assert.equal(sameActiveDeployment(one,same),true);assert.equal(sameActiveDeployment(one,changed),false)
})
test('automatic cleanup selects whole retired namespaces and preserves unknown objects',()=>{
  const full=planIncrementalCacheCleanup({objects:[
    {key:'incremental-cache/cache-old/a.cache',size:20,uploaded:'2026-09-01T00:00:00Z'},
    {key:'incremental-cache/cache-old/b.cache',size:20,uploaded:'2026-09-01T00:01:00Z'},
    {key:`incremental-cache/${retiredNamespace}/candidate.cache`,size:15,uploaded:'2026-09-02T00:00:00Z'},
    {key:'incremental-cache/unregistered/d.cache',size:50,uploaded:'2026-09-03T00:00:00Z'},
  ],releases,activeWorkerVersions:[active],now:Date.parse('2026-09-19T12:00:00Z')})
  const batch=selectAutomaticCleanupBatch(full,{maxFiles:2,maxBytes:40})
  assert.deepEqual(batch.deleteObjects.map(row=>row.key),['incremental-cache/cache-old/a.cache','incremental-cache/cache-old/b.cache'])
  assert.deepEqual(batch.automaticBatch.selectedCacheNamespaces,['cache-old'])
  assert.deepEqual(batch.automaticBatch.deferred,{files:1,bytes:15})
  assert.deepEqual(batch.automaticBatch.preservedUnknown,{files:1,bytes:50})
  assert.deepEqual(assertAutomaticCleanupPlan(batch,{maxFiles:2,maxBytes:40}),{
    shouldExecute:true,files:2,bytes:40,fingerprint:batch.deleteFingerprint,hasDeferred:true,unknownFiles:1,
  })
  assert.doesNotThrow(()=>assertReviewedCleanupPlan(batch,{files:2,bytes:40,fingerprint:batch.deleteFingerprint},{allowUnknownObjects:true}))
  assert.throws(()=>assertReviewedCleanupPlan(batch,{files:2,bytes:40,fingerprint:batch.deleteFingerprint}),/unclassified/)
})
test('automatic cleanup splits an oversized retired namespace into bounded repeatable batches',()=>{
  const oversized=planIncrementalCacheCleanup({objects:[
    {key:'incremental-cache/cache-old/a.cache',size:20},{key:'incremental-cache/cache-old/b.cache',size:20},
  ],releases,activeWorkerVersions:[active],now:Date.parse('2026-09-19T12:00:00Z')})
  const first=selectAutomaticCleanupBatch(oversized,{maxFiles:1,maxBytes:40})
  assert.deepEqual(first.deleteObjects.map(row=>row.key),['incremental-cache/cache-old/a.cache'])
  assert.deepEqual(first.automaticBatch.deferred,{files:1,bytes:20})
  const remaining=planIncrementalCacheCleanup({objects:[{key:'incremental-cache/cache-old/b.cache',size:20}],releases,activeWorkerVersions:[active],now:Date.parse('2026-09-19T12:00:00Z')})
  const second=selectAutomaticCleanupBatch(remaining,{maxFiles:1,maxBytes:40})
  assert.deepEqual(second.deleteObjects.map(row=>row.key),['incremental-cache/cache-old/b.cache'])
  assert.deepEqual(second.automaticBatch.deferred,{files:0,bytes:0})
  assert.throws(()=>selectAutomaticCleanupBatch(oversized,{maxFiles:1,maxBytes:19}),/object exceeds/)
  const empty=planIncrementalCacheCleanup({objects:[{key:'incremental-cache/cache-active/a.cache',size:10}],releases,activeWorkerVersions:[active],now:Date.parse('2026-09-15T12:00:00Z')})
  const batch=selectAutomaticCleanupBatch(empty,{maxFiles:1,maxBytes:1})
  assert.equal(assertAutomaticCleanupPlan(batch,{maxFiles:1,maxBytes:1}).shouldExecute,false)
})
test('a release newer than the active deployment is protected as a pending candidate',()=>{
  const future={schema:1,workerVersion:'55555555-5555-4555-8555-555555555555',buildId:'future',appVersion:'cache-future',deployedAt:'2026-09-16T00:00:00.000Z'}
  const plan=planIncrementalCacheCleanup({objects:[{key:'incremental-cache/cache-future/a.cache',size:10}],releases:[...releases,future],
    activeWorkerVersions:[active],now:Date.parse('2026-09-20T00:00:00Z')})
  assert.equal(plan.summary.delete.files,0);assert.equal(plan.protectedCacheNamespaces['cache-future'],'newer deployment candidate')
})
