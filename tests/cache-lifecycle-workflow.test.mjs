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

test('post-deployment cleanup accepts only the fixed event and never reads dispatch payload as authority',()=>{
  assert.match(cleanup,/repository_dispatch:\s*\n\s+types: \[cache-production-deployed\]/)
  assert.match(cleanup,/workflow_dispatch:/)
  assert.doesNotMatch(cleanup,/client_payload|github\.event\.(?:inputs|action)/)
  assert.match(cleanup,/environment: production-cache-maintenance/)
  assert.match(cleanup,/cancel-in-progress: false/)
  assert.equal((cleanup.match(/cleanup-incremental-cache\.mjs --registry cache-release-registry\.json --report cache-cleanup-plan-/g)||[]).length,2)
})

test('cleanup always summarizes setup and registry failures and preserves the structured reports',()=>{
  assert.match(cleanup,/name: Summarize measured cleanup results[^\n]*\n\s+if: \$\{\{ always\(\) \}\}/)
  assert.match(cleanup,/CLEANUP_JOB_STATUS: \$\{\{ job\.status \}\}/)
  assert.match(cleanup,/CLEANUP_STEPS_JSON: \$\{\{ toJSON\(steps\) \}\}/)
  assert.match(cleanup,/초기 준비 실패로 보고서를 만들지 못했습니다/)
  assert.match(cleanup,/cache-cleanup-summary\.json/)
  assert.match(cleanup,/cache-cleanup-plan-\*\.json/)
  assert.match(cleanup,/cache-cleanup-execution-\*\.json/)
})
