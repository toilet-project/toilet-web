import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'

const refresh=await readFile(new URL('../.github/workflows/shared-toilet-cache-refresh.yml',import.meta.url),'utf8')
const cleanup=await readFile(new URL('../.github/workflows/toilet-cache-cleanup-scheduled.yml',import.meta.url),'utf8')

test('shared data refresh is scheduled but disabled until its explicit gate is enabled',()=>{
  assert.match(refresh,/schedule:/);assert.match(refresh,/workflow_dispatch:/)
  assert.match(refresh,/vars\.CACHE_DATA_REFRESH_ENABLED == 'true'/)
  assert.match(refresh,/group: shared-toilet-data-cache-refresh/)
  assert.match(refresh,/cancel-in-progress: false/)
  assert.match(refresh,/--partition-count 28/);assert.match(refresh,/--rps 5/)
  assert.match(refresh,/actions\/cache\/restore@v4/);assert.match(refresh,/actions\/cache\/save@v4/)
  assert.doesNotMatch(refresh,/deployment[_-]id|version\.json/i)
})
test('scheduled cleanup is fail-closed, capped, split into two fresh batches and shares the manual cleanup lock',()=>{
  assert.match(cleanup,/schedule:/);assert.match(cleanup,/vars\.CACHE_CLEANUP_AUTOMATIC_ENABLED == 'true'/)
  assert.match(cleanup,/group: production-incremental-cache-cleanup/)
  assert.match(cleanup,/cache-cleanup-plan-1\.json/);assert.match(cleanup,/cache-cleanup-plan-2\.json/)
  assert.match(cleanup,/steps\.plan_1\.outputs\.has_deferred == 'true'/)
  assert.equal((cleanup.match(/--expected-delete-fingerprint/g)||[]).length,2)
  assert.match(cleanup,/--max-delete-files/);assert.match(cleanup,/--max-delete-bytes/)
  assert.match(cleanup,/R2_CACHE_DELETE_ACCESS_KEY_ID/)
})
