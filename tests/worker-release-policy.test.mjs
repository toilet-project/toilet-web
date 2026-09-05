import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateWorkerConfig, validateBuildPolicy, validateReleaseManifest} from '../scripts/worker-release-policy.mjs'
const preview = JSON.parse(await readFile(new URL('../wrangler.jsonc',import.meta.url)))
const production = JSON.parse(await readFile(new URL('../wrangler.production.jsonc',import.meta.url)))
const header = {headers:[{headers:[{key:'X-Robots-Tag',value:'noindex, nofollow'}]}]}
const none = {headers:[]}
test('preview retains its domain, storage and noindex',()=>{
  validateWorkerConfig(preview,'preview',{deploy:true})
  validateBuildPolicy(preview,'preview','false',header)
})
test('production candidate is isolated and undeployable',()=>{
  validateBuildPolicy(production,'production-candidate','true',none)
  assert.throws(()=>validateWorkerConfig(production,'production-candidate',{deploy:true}))
})

test('explicit private staging requires real storage and no version URL',()=>{
  validateWorkerConfig(production,'production-candidate',{deploy:true,stage:true})
  for(const change of [{preview_urls:true},{workers_dev:true},{routes:[{pattern:'geupddong.com',custom_domain:true}]},
    {d1_databases:[{...production.d1_databases[0],database_id:'00000000-0000-0000-0000-000000000000'}]}]) {
    assert.throws(()=>validateWorkerConfig({...production,...change},'production-candidate',{deploy:true,stage:true}))
  }
})

test('release manifest binds target, commit, config and build without granting approval',()=>{
  const commit='a'.repeat(40), hash='b'.repeat(64)
  const manifest={target:'production-candidate',sourceCommit:commit,configFile:'wrangler.production.jsonc',configSha256:hash,buildId:'build-1',indexable:true,deploymentApproved:false}
  const check=m=>validateReleaseManifest(m,production,hash,'build-1',commit,'production-candidate')
  check(manifest)
  for(const change of [{target:'preview'},{sourceCommit:'c'.repeat(40)},{configFile:'wrangler.jsonc'},
    {configSha256:'changed'},{buildId:'different'},{indexable:false},{deploymentApproved:true}]) assert.throws(()=>check({...manifest,...change}))
})
test('build/runtime mismatch or preview robots in candidate fails',()=>{
  assert.throws(()=>validateBuildPolicy(production,'production-candidate','false',none))
  assert.throws(()=>validateBuildPolicy(production,'production-candidate','true',header))
  assert.throws(()=>validateBuildPolicy(preview,'preview','false',none))
})
test('candidate cannot claim root or share preview cache',()=>{
  assert.throws(()=>validateWorkerConfig({...production,routes:[{pattern:'geupddong.com',custom_domain:true}]},'production-candidate'))
  assert.throws(()=>validateWorkerConfig({...production,r2_buckets:preview.r2_buckets},'production-candidate'))
  assert.throws(()=>validateWorkerConfig({...production,d1_databases:[{...production.d1_databases[0],database_id:preview.d1_databases[0].database_id}]},'production-candidate'))
})
test('no unexpected target, nested env, CPU upgrade or singular route',()=>{
  assert.throws(()=>validateWorkerConfig(preview,'typo'))
  for(const change of [{env:{}},{limits:{cpu_ms:1000}},{route:'geupddong.com/*'}]) assert.throws(()=>validateWorkerConfig({...preview,...change},'preview'))
})
