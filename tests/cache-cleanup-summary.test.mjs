import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {basename, join, resolve, sep} from 'node:path'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {renderCacheCleanupSummary, summarizeCacheCleanup} from '../scripts/summarize-cache-cleanup.mjs'
import {runIncrementalCacheCleanup} from '../scripts/cache/cleanup-runner-lib.mjs'

const script = fileURLToPath(new URL('../scripts/summarize-cache-cleanup.mjs', import.meta.url))
function report(files, bytes, extra = {}) {
  return {schema: 1, status: 'completed', stage: 'complete', failure: null, mode: 'dry-run',
    summary: {delete: {files, bytes}, protected: {files: 20, bytes: 200}, unknown: {files: 2, bytes: 30}},
    execution: {attempted: false, deletedFiles: 0, deletedFilesExact: true, completedAt: null, error: null}, ...extra}
}
function executed(selectedFiles, selectedBytes, deferredFiles, deferredBytes, extra = {}) {
  return report(selectedFiles, selectedBytes, {mode: 'execute',
    automaticBatch: {deferred: {files: deferredFiles, bytes: deferredBytes}},
    execution: {attempted: true, deletedFiles: selectedFiles, deletedBytes: selectedBytes,
      deletedFilesExact: true, deletedBytesExact: true, completedAt: '2026-10-24T00:00:00Z', error: null}, ...extra})
}
async function cli(t, reports, context) {
  const directory = await mkdtemp(join(tmpdir(), 'cleanup-summary-test-'))
  t.after(async () => {
    const absolute = resolve(directory)
    assert.ok(absolute.startsWith(resolve(tmpdir()) + sep) && basename(absolute).startsWith('cleanup-summary-test-'))
    await rm(absolute, {recursive: true, force: true})
  })
  for (const [name, value] of Object.entries(reports)) await writeFile(join(directory, name), typeof value === 'string' ? value : JSON.stringify(value))
  const markdown = join(directory, 'summary.md'), json = join(directory, 'summary.json')
  const result = spawnSync(process.execPath, [script, '--report-directory', directory, '--json-output', json], {
    encoding: 'utf8', env: {...process.env, CLEANUP_JOB_STATUS: context.jobStatus,
      CLEANUP_STEPS_JSON: JSON.stringify(context.steps ?? {}), GITHUB_STEP_SUMMARY: markdown},
  })
  return {exitCode: result.status, stdout: result.stdout, stderr: result.stderr,
    summary: JSON.parse(await readFile(json, 'utf8')), markdown: await readFile(markdown, 'utf8')}
}

test('a measured no-candidate CLI run preserves unknown objects and reports completion without deletion', async t => {
  const result = await cli(t, {'cache-cleanup-plan-1.json': report(0, 0)}, {jobStatus: 'success',
    steps: {plan_report_1: {outcome: 'success'}, execute_1: {outcome: 'skipped'}}})
  assert.equal(result.exitCode, 0)
  assert.equal(result.summary.status, 'completed')
  assert.deepEqual(result.summary.deleted, {files: 0, bytes: 0, exact: true})
  assert.deepEqual(result.summary.unclassified, {files: 2, bytes: 30})
  assert.match(result.markdown, /삭제 가능한 퇴역 페이지 캐시가 없었습니다/)
})

test('two bounded batches sum confirmed deletion but use only the latest snapshot for retained and remaining counts', async t => {
  const result = await cli(t, {
    'cache-cleanup-plan-1.json': report(5, 50),
    'cache-cleanup-execution-1.json': executed(2, 20, 3, 30),
    'cache-cleanup-plan-2.json': report(3, 30),
    'cache-cleanup-execution-2.json': executed(2, 20, 1, 10, {
      summary: {delete: {files: 2, bytes: 20}, protected: {files: 22, bytes: 220}, unknown: {files: 3, bytes: 40}},
    }),
  }, {jobStatus: 'success'})
  assert.equal(result.exitCode, 0)
  assert.deepEqual(result.summary.deleted, {files: 4, bytes: 40, exact: true})
  assert.deepEqual(result.summary.protected, {files: 22, bytes: 220})
  assert.deepEqual(result.summary.unclassified, {files: 3, bytes: 40})
  assert.deepEqual(result.summary.remaining, {files: 1, bytes: 10, exact: true})
  assert.match(result.markdown, /남은 후보는 다음 실행/)
})

test('setup failure without any plan is a failed CLI result with unmeasured inventory', async t => {
  const result = await cli(t, {}, {jobStatus: 'failure', steps: {checkout: {outcome: 'failure'}}})
  assert.equal(result.exitCode, 1)
  assert.equal(result.summary.status, 'failed')
  assert.equal(result.summary.snapshotAvailable, false)
  assert.equal(result.summary.protected, null)
  assert.equal(result.summary.remaining, null)
  assert.match(result.markdown, /상태: \*\*실패\*\*/)
  assert.match(result.markdown, /미측정 수량을 0건 또는 정리 성공으로 해석하면 안 됩니다/)
  assert.ok(result.summary.failures.some(failure => failure.code === 'checkout-failed'))
})

test('missing active registry manifest remains an explicit failure and never reveals original errors or object keys', async t => {
  const result = await cli(t, {'cache-cleanup-plan-1.json': {
    schema: 1, status: 'failed', stage: 'registry-validation', failure: {stage: 'registry-validation', code: 'active-release-missing'},
    summary: null, deleteObjects: null, unknownObjects: [{key: 'SECRET_OBJECT_KEY'}],
    execution: {attempted: false, deletedFiles: 0, deletedFilesExact: true, error: 'SECRET_TOKEN https://private.invalid'},
  }}, {jobStatus: 'failure', steps: {plan_report_1: {outcome: 'failure'}}})
  assert.equal(result.exitCode, 1)
  assert.equal(result.summary.snapshotAvailable, false)
  assert.match(result.markdown, /active-release-missing/)
  assert.doesNotMatch(result.stdout + result.stderr + result.markdown, /SECRET_|private\.invalid|unknownObjects/)
})

test('a partially failed delete keeps only confirmed lower bounds and does not pretend remaining bytes are exact', async t => {
  const partial = executed(5, 50, 3, 30, {
    status: 'failed', stage: 'delete', failure: {stage: 'delete', code: 'delete-failed'},
    execution: {attempted: true, deletedFiles: 2, deletedFilesExact: false, deletedBytesExact: false,
      completedAt: '2026-10-24T00:00:00Z', error: 'delete-failed'},
  })
  const result = await cli(t, {'cache-cleanup-plan-1.json': report(8, 80), 'cache-cleanup-execution-1.json': partial},
    {jobStatus: 'failure', steps: {execute_1: {outcome: 'failure'}}})
  assert.equal(result.exitCode, 1)
  assert.deepEqual(result.summary.deleted, {files: 2, bytes: null, exact: false})
  assert.deepEqual(result.summary.remaining, {files: 6, bytes: null, exact: false})
  assert.match(result.markdown, /하한값/)
  assert.match(result.markdown, /최대치/)
})

test('missing or malformed execution reports never convert a failed delete into a confirmed zero', async t => {
  const result = await cli(t, {'cache-cleanup-plan-1.json': report(8, 80), 'cache-cleanup-execution-1.json': '{invalid'},
    {jobStatus: 'failure', steps: {execute_1: {outcome: 'failure'}}})
  assert.equal(result.exitCode, 1)
  assert.equal(result.summary.deleted.exact, false)
  assert.equal(result.summary.remaining.exact, false)
  assert.ok(result.summary.failures.some(failure => failure.code === 'summary-report-invalid'))
})

test('untrusted stage and code values cannot enter Markdown and cancellation cannot appear completed', () => {
  const result = summarizeCacheCleanup({'cache-cleanup-plan-1.json': {report: {
    ...report(1, 10), status: 'failed', stage: 'SECRET_STAGE', failure: {stage: 'SECRET_STAGE', code: 'SECRET_CODE'},
  }}}, {jobStatus: 'cancelled'})
  assert.equal(result.status, 'cancelled')
  assert.doesNotMatch(renderCacheCleanupSummary(result), /SECRET_/)
  assert.ok(result.failures.some(failure => failure.code === 'workflow-cancelled'))
})

test('confirmed partial deletion bytes remain lower bounds while the unprocessed candidate totals remain upper bounds', () => {
  const partial = executed(5, 50, 3, 30, {status: 'failed', stage: 'delete',
    failure: {stage: 'delete', code: 'delete-acknowledgement-incomplete'},
    execution: {attempted: true, deletedFiles: 2, deletedBytes: 20, deletedFilesExact: false,
      deletedBytesExact: false, completedAt: '2026-10-24T00:00:00Z', error: 'delete-acknowledgement-incomplete'}})
  const summary = summarizeCacheCleanup({'cache-cleanup-execution-1.json': {report: partial}}, {jobStatus: 'failure'})
  assert.deepEqual(summary.deleted, {files: 2, bytes: 20, exact: false})
  assert.deepEqual(summary.remaining, {files: 6, bytes: 60, exact: false})
  assert.ok(summary.failures.some(failure => failure.code === 'delete-acknowledgement-incomplete'))
})

test('the real cleanup runner registry error survives the reporting boundary without exposing its input', async () => {
  let inventoryOpened = false
  const failure = await runIncrementalCacheCleanup({args: {registry: 'registry.json', report: 'plan.json'},
    env: {R2_INCREMENTAL_CACHE_BUCKET: 'geupddong-next-production-cache'},
    getDeploymentStatus: async () => ({workerName: 'geupddong-web-production', activeWorkerVersions: ['11111111-1111-4111-8111-111111111111']}),
    readRegistry: async () => [{schema: 1, cacheNamespace: 'PRIVATE_INVALID_ENTRY'}],
    createStore() { inventoryOpened = true; throw new Error('should not reach storage') }, writeReport: async () => {},
  })
  assert.equal(inventoryOpened, false)
  assert.equal(failure.failure.code, 'registry-entry-invalid')
  const summary = summarizeCacheCleanup({'cache-cleanup-plan-1.json': {report: failure}}, {jobStatus: 'failure'})
  assert.ok(summary.failures.some(item => item.code === failure.failure.code))
  assert.doesNotMatch(JSON.stringify(summary) + renderCacheCleanupSummary(summary), /PRIVATE_INVALID_ENTRY/)
})

test('an unfinished report cannot be declared complete even when the outer workflow status says success', () => {
  const summary = summarizeCacheCleanup({'cache-cleanup-plan-1.json': {report: report(1, 10, {status: 'running', stage: 'plan'})}}, {jobStatus: 'success'})
  assert.equal(summary.status, 'failed')
  assert.ok(summary.failures.some(item => item.code === 'summary-report-incomplete'))
})

test('a second planning failure retains first-batch confirmed progress without adding the same inventory twice', async t => {
  const result = await cli(t, {'cache-cleanup-plan-1.json': report(5, 50),
    'cache-cleanup-execution-1.json': executed(2, 20, 3, 30),
    'cache-cleanup-plan-2.json': {schema: 1, status: 'failed', stage: 'registry-validation',
      failure: {stage: 'registry-validation', code: 'REGISTRY_ACTIVE_NOT_FINALIZED'}, summary: null},
  }, {jobStatus: 'failure', steps: {plan_report_2: {outcome: 'failure'}}})
  assert.equal(result.exitCode, 1)
  assert.deepEqual(result.summary.deleted, {files: 2, bytes: 20, exact: true})
  assert.deepEqual(result.summary.remaining, {files: 3, bytes: 30, exact: true})
  assert.deepEqual(result.summary.protected, {files: 20, bytes: 200})
  assert.match(result.markdown, /REGISTRY_ACTIVE_NOT_FINALIZED/)
  assert.match(result.markdown, /실패 전 마지막 계획/)
})
