import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {validateWorkerConfig, validateBuildPolicy} from '../scripts/worker-release-policy.mjs'
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
