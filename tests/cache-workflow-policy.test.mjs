import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'

const prewarm=await readFile(new URL('../.github/workflows/toilet-cache-maintenance.yml',import.meta.url),'utf8')
const cleanup=await readFile(new URL('../.github/workflows/toilet-cache-cleanup-plan.yml',import.meta.url),'utf8')
const execute=await readFile(new URL('../.github/workflows/toilet-cache-cleanup-execute.yml',import.meta.url),'utf8')

test('cache workflows stay manually dispatched and opt-in',()=>{
  for(const source of [prewarm,cleanup,execute]){
    assert.match(source,/\non:\s*\n\s+workflow_dispatch:/)
    assert.doesNotMatch(source,/\n\s+(schedule|push|pull_request):/)
  }
  assert.match(prewarm,/vars\.CACHE_PREWARM_ENABLED == 'true'/)
  assert.match(prewarm,/group: toilet-cache-production/)
  assert.match(prewarm,/actions\/cache\/restore@v4/)
  assert.match(prewarm,/actions\/cache\/save@v4/)
  assert.match(prewarm,/--require-fresh/)
  assert.match(prewarm,/\$DEPLOYMENT_ID-fresh-v1\.json/)
  assert.match(prewarm,/--fresh-attempts 6 --fresh-wait-seconds 1/)
  assert.match(prewarm,/--concurrency 8 --rps 5 --verify-samples 20/)
  assert.match(cleanup,/vars\.CACHE_CLEANUP_DRY_RUN_ENABLED == 'true'/)
})

test('the cleanup planning workflow can only produce a dry-run plan',()=>{
  assert.doesNotMatch(cleanup,/--execute/)
  assert.doesNotMatch(cleanup,/CACHE_CLEANUP_ENABLED/)
  assert.match(cleanup,/R2_CACHE_READ_ACCESS_KEY_ID/)
  assert.match(cleanup,/cache-cleanup-plan\.json/)
})

test('the cleanup execution workflow is manual, gated and bound to the reviewed plan',()=>{
  assert.match(execute,/vars\.CACHE_CLEANUP_EXECUTE_ENABLED == 'true'/)
  assert.match(execute,/DELETE_RETIRED_INCREMENTAL_CACHE/)
  assert.match(execute,/R2_CACHE_DELETE_ACCESS_KEY_ID/)
  assert.match(execute,/--execute/)
  assert.match(execute,/--expected-delete-files/)
  assert.match(execute,/--expected-delete-bytes/)
  assert.match(execute,/--expected-delete-fingerprint/)
  assert.match(execute,/group: production-incremental-cache-cleanup/)
})
