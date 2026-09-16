import assert from 'node:assert/strict'
import test from 'node:test'
import {cacheNamespaceFromKey,normalizeDeploymentStatus,planIncrementalCacheCleanup,sameActiveDeployment} from '../scripts/cache/cleanup-lib.mjs'

const active='11111111-1111-4111-8111-111111111111',previous='22222222-2222-4222-8222-222222222222',old='33333333-3333-4333-8333-333333333333'
const releases=[
  {schema:1,workerVersion:old,buildId:'next-build-old',appVersion:'cache-old',deployedAt:'2026-09-01T00:00:00.000Z'},
  {schema:1,workerVersion:previous,buildId:'next-build-previous',appVersion:'cache-previous',deployedAt:'2026-09-14T00:00:00.000Z'},
  {schema:1,workerVersion:active,buildId:'next-build-active',appVersion:'cache-active',deployedAt:'2026-09-15T00:00:00.000Z'},
]
test('only recognized retired builds outside rollback protection are selected',()=>{
  const objects=[
    {key:'incremental-cache/cache-active/a.cache',size:10},{key:'incremental-cache/cache-previous/b.cache',size:20},
    {key:'incremental-cache/cache-old/c.cache',size:30},{key:'public-toilets/v1/toilets/1.json',size:40},
    {key:'incremental-cache/unregistered/d.cache',size:50},
  ]
  const plan=planIncrementalCacheCleanup({objects,releases,activeWorkerVersions:[active],now:Date.parse('2026-09-15T12:00:00Z')})
  assert.deepEqual(plan.deleteObjects.map(row=>row.key),['incremental-cache/cache-old/c.cache'])
  assert.equal(plan.protectedObjects.length,2);assert.equal(plan.unknownObjects.length,2);assert.equal(plan.summary.delete.bytes,30)
  assert.deepEqual(plan.protectedCacheNamespaces,{'cache-active':'active traffic','cache-previous':'rollback protection until 2026-09-18T00:00:00.000Z'})
})
test('missing active manifest and ambiguous keys fail closed',()=>{
  assert.throws(()=>planIncrementalCacheCleanup({objects:[],releases,activeWorkerVersions:['44444444-4444-4444-8444-444444444444']}),/missing a release manifest/)
  assert.equal(cacheNamespaceFromKey('incremental-cache/deployment/hash.cache'),'deployment');assert.equal(cacheNamespaceFromKey('other/deployment/hash.cache'),null)
  assert.throws(()=>planIncrementalCacheCleanup({objects:[],releases:[{...releases[0],cacheNamespace:'different'}],activeWorkerVersions:[old]}),/does not match app version/)
})
test('deployment snapshots normalize traffic and detect a change',()=>{
  const one=normalizeDeploymentStatus({versions:[{version_id:active,percentage:100},{version_id:old,percentage:0}]},'worker')
  const same=normalizeDeploymentStatus({versions:[{version_id:active,percentage:100}]},'worker')
  const changed=normalizeDeploymentStatus({versions:[{version_id:previous,percentage:100}]},'worker')
  assert.equal(sameActiveDeployment(one,same),true);assert.equal(sameActiveDeployment(one,changed),false)
})
