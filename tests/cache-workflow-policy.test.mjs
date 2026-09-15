import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'

const prewarm=await readFile(new URL('../.github/workflows/toilet-cache-maintenance.yml',import.meta.url),'utf8')
const cleanup=await readFile(new URL('../.github/workflows/toilet-cache-cleanup-plan.yml',import.meta.url),'utf8')

test('cache workflows stay manually dispatched and opt-in',()=>{
  for(const source of [prewarm,cleanup]){
    assert.match(source,/\non:\s*\n\s+workflow_dispatch:/)
    assert.doesNotMatch(source,/\n\s+(schedule|push|pull_request):/)
  }
  assert.match(prewarm,/vars\.CACHE_PREWARM_ENABLED == 'true'/)
  assert.match(prewarm,/group: toilet-cache-production/)
  assert.match(prewarm,/actions\/cache\/restore@v4/)
  assert.match(prewarm,/actions\/cache\/save@v4/)
  assert.match(cleanup,/vars\.CACHE_CLEANUP_DRY_RUN_ENABLED == 'true'/)
})

test('the committed cleanup workflow can only produce a dry-run plan',()=>{
  assert.doesNotMatch(cleanup,/--execute/)
  assert.doesNotMatch(cleanup,/CACHE_CLEANUP_ENABLED/)
  assert.match(cleanup,/R2_CACHE_READ_ACCESS_KEY_ID/)
  assert.match(cleanup,/cache-cleanup-plan\.json/)
})
