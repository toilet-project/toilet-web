import {appendFile, readFile, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

const REPORTS = [
  {name: 'cache-cleanup-plan-1.json', batch: 1, kind: 'plan', step: 'plan_report_1'},
  {name: 'cache-cleanup-execution-1.json', batch: 1, kind: 'execution', step: 'execute_1'},
  {name: 'cache-cleanup-plan-2.json', batch: 2, kind: 'plan', step: 'plan_report_2'},
  {name: 'cache-cleanup-execution-2.json', batch: 2, kind: 'execution', step: 'execute_2'},
]
const STAGES = new Set(['setup', 'active-status', 'registry-read', 'registry-validation', 'inventory',
  'plan', 'review', 'deployment-check', 'delete', 'report', 'complete'])
const CODES = new Set(['configuration-invalid', 'active-status-failed', 'registry-read-failed',
  'registry-empty', 'registry-entry-invalid', 'registry-namespace-mismatch', 'registry-release-unverified',
  'registry-namespace-duplicate', 'registry-worker-duplicate', 'registry-invalid', 'REGISTRY_ACTIVE_NOT_FINALIZED',
  'active-versions-invalid', 'active-release-missing', 'inventory-read-failed', 'plan-failed', 'review-rejected',
  'active-deployment-changed', 'delete-failed', 'delete-acknowledgement-incomplete', 'report-write-failed'])
const STEP_FAILURES = {
  checkout: ['setup', 'checkout-failed'], pnpm_setup: ['setup', 'package-manager-setup-failed'],
  node_setup: ['setup', 'node-setup-failed'], install: ['setup', 'dependency-install-failed'],
  registry: ['registry-read', 'registry-input-failed'], plan_report_1: ['plan', 'plan-failed'],
  plan_1: ['review', 'selection-failed'], execute_1: ['delete', 'delete-failed'],
  plan_report_2: ['plan', 'plan-failed'], plan_2: ['review', 'selection-failed'],
  execute_2: ['delete', 'delete-failed'],
}
const number = value => Number.isSafeInteger(value) && value >= 0
function totals(value) {
  return value && number(value.files) && number(value.bytes) ? {files: value.files, bytes: value.bytes} : null
}
function validSummary(report) {
  const summary = report?.summary
  if (!summary) return null
  const candidate = totals(summary.delete), protectedObjects = totals(summary.protected), unknown = totals(summary.unknown)
  if (!candidate || !protectedObjects || !unknown) return null
  const deferred = report.automaticBatch ? totals(report.automaticBatch.deferred) : {files: 0, bytes: 0}
  if (!deferred) return null
  return {candidate, protectedObjects, unknown, deferred}
}
function executionCounts(report) {
  const execution = report?.execution
  if (!execution || !number(execution.deletedFiles)) return {files: 0, bytes: null, exact: false}
  const exact = (execution.deletedFilesExact === true
    || (execution.deletedFilesExact === undefined && !execution.error && Boolean(execution.completedAt))
    || (execution.attempted === false && execution.deletedFiles === 0)) && execution.deletedBytesExact !== false
  let bytes = number(execution.deletedBytes) ? execution.deletedBytes : null
  const snapshot = validSummary(report)
  if (bytes === null && exact && execution.deletedFiles === 0) bytes = 0
  if (bytes === null && exact && !execution.error && execution.completedAt
    && snapshot?.candidate.files === execution.deletedFiles) bytes = snapshot.candidate.bytes
  return {files: execution.deletedFiles, bytes, exact}
}

// Counts and whitelisted failure codes only: object keys, namespaces, raw errors,
// deployment identifiers and workflow payload values never enter this summary.
export function summarizeCacheCleanup(records, {jobStatus = 'unknown', steps = {}} = {}) {
  const failures = []
  const addFailure = (stage, code) => {
    if (!failures.some(item => item.stage === stage && item.code === code)) failures.push({stage, code})
  }
  let snapshot = null, deletedFiles = 0, deletedBytes = 0, deletedExact = true, bytesKnown = true
  for (const descriptor of REPORTS) {
    const record = records[descriptor.name]
    const report = record?.report
    const outcome = steps[descriptor.step]?.outcome
    if (record?.invalid) addFailure('report', 'summary-report-invalid')
    if (report && (report.schema !== 1 || (report.status !== undefined && !['completed', 'failed'].includes(report.status))))
      addFailure('report', 'summary-report-incomplete')
    if (report?.status === 'failed' || report?.failure || report?.execution?.error) {
      const failure = report.failure
      addFailure(STAGES.has(failure?.stage) ? failure.stage : STAGES.has(report.stage) ? report.stage : 'report',
        CODES.has(failure?.code) ? failure.code : CODES.has(report.execution?.error) ? report.execution.error : 'cleanup-failed')
    }
    const counts = validSummary(report)
    if (counts) snapshot = {batch: descriptor.batch, ...counts,
      deleted: descriptor.kind === 'execution' ? executionCounts(report) : {files: 0, bytes: 0, exact: true}}
    if (descriptor.kind === 'execution') {
      if (report) {
        const deleted = executionCounts(report)
        deletedFiles += deleted.files
        deletedExact &&= deleted.exact
        if (deleted.bytes === null) bytesKnown = false
        else deletedBytes += deleted.bytes
      } else if (['success', 'failure', 'cancelled'].includes(outcome)) {
        // A writer may have stopped after sending a delete but before reporting it.
        deletedExact = false; bytesKnown = false
      }
    }
    if (outcome === 'success' && (!report || !counts)) addFailure('report', 'summary-report-missing')
  }
  for (const [step, [stage, code]] of Object.entries(STEP_FAILURES)) {
    if (!['failure', 'cancelled'].includes(steps[step]?.outcome)) continue
    const descriptor = REPORTS.find(item => item.step === step)
    if (!descriptor || !records[descriptor.name]?.report?.failure) addFailure(stage, code)
  }
  if (!snapshot && !failures.length) addFailure('report', 'summary-report-missing')
  if (jobStatus === 'failure' && !failures.length) addFailure('setup', 'workflow-failed')
  if (jobStatus === 'cancelled') addFailure('setup', 'workflow-cancelled')
  if (!['success', 'failure', 'cancelled'].includes(jobStatus)) addFailure('setup', 'workflow-status-unavailable')

  let remaining = null
  if (snapshot) {
    const files = snapshot.candidate.files + snapshot.deferred.files - snapshot.deleted.files
    const bytes = snapshot.deleted.bytes === null ? null
      : snapshot.candidate.bytes + snapshot.deferred.bytes - snapshot.deleted.bytes
    if (files < 0 || (bytes !== null && bytes < 0)) addFailure('report', 'summary-counts-inconsistent')
    else remaining = {files, bytes, exact: snapshot.deleted.exact && deletedExact}
  }
  const status = jobStatus === 'cancelled' ? 'cancelled' : failures.length ? 'failed' : 'completed'
  return {schema: 1, scope: 'production-incremental-cache', status,
    deleted: {files: deletedFiles, bytes: bytesKnown ? deletedBytes : null, exact: deletedExact},
    snapshotAvailable: Boolean(snapshot), snapshotBatch: snapshot?.batch ?? null,
    protected: snapshot?.protectedObjects ?? null, unclassified: snapshot?.unknown ?? null,
    remaining, failures}
}

const format = value => Number.isSafeInteger(value) ? value.toLocaleString('ko-KR') : '미확인'
function metric(value) { return value ? `${format(value.files)}개 / ${format(value.bytes)} B` : '미측정' }
export function renderCacheCleanupSummary(summary) {
  const status = {completed: '완료', failed: '실패', cancelled: '취소'}[summary.status]
  const deletion = `${metric(summary.deleted)}${summary.deleted.exact ? '' : ' (확인된 하한값, 실제 전체 미확인)'}`
  const remaining = summary.remaining ? `${metric(summary.remaining)}${summary.remaining.exact ? '' : ' (최대치, 추가 확인 필요)'}` : '미측정'
  const lines = ['## 운영 퇴역 페이지 캐시 정리', '', `상태: **${status}**`, '',
    '| 항목 | 결과 |', '| --- | --- |', `| 확인된 실제 삭제 | ${deletion} |`,
    `| 보호 대상 | ${metric(summary.protected)} |`, `| 미분류 보존 | ${metric(summary.unclassified)} |`,
    `| 미처리 삭제 후보 | ${remaining} |`, '',
    summary.snapshotAvailable ? `보호·미분류·미처리는 마지막 ${summary.snapshotBatch}번 묶음 계획을 기준으로 하며, 전체 버킷의 현재 용량이 아닙니다.`
      : '삭제 계획을 확인하지 못했습니다. 미측정 수량을 0건 또는 정리 성공으로 해석하면 안 됩니다.',
    '공유 데이터·정적 자산·이미지와 다른 버킷은 정리 대상이 아닙니다.']
  if (summary.status === 'completed' && summary.remaining?.files === 0 && summary.deleted.files === 0)
    lines.push('', '이번 조회에는 삭제 가능한 퇴역 페이지 캐시가 없었습니다.')
  if (summary.status === 'completed' && summary.remaining?.files > 0)
    lines.push('', '두 묶음 처리 뒤 남은 후보는 다음 실행에서 다시 조회합니다.')
  if (summary.failures.length) {
    lines.push('', '실패·중단 사유:')
    for (const failure of summary.failures) lines.push(`- ${failure.stage}: \`${failure.code}\``)
    lines.push('', '실패 전 마지막 계획 또는 확인된 삭제 수량만 표시합니다. 실패한 실행은 완료로 간주하지 않습니다.')
  }
  return lines.join('\n') + '\n'
}

async function main() {
  const options = {}
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i], value = process.argv[i + 1]
    if (!['--report-directory', '--json-output'].includes(key) || !value || options[key]) throw new Error('invalid-options')
    options[key] = value
  }
  const directory = resolve(options['--report-directory'] ?? '.')
  const records = {}
  for (const descriptor of REPORTS) {
    try { records[descriptor.name] = {report: JSON.parse(await readFile(resolve(directory, descriptor.name), 'utf8'))} }
    catch (error) { if (error.code !== 'ENOENT') records[descriptor.name] = {invalid: true} }
  }
  let steps = {}
  try { steps = JSON.parse(process.env.CLEANUP_STEPS_JSON ?? '{}') } catch { /* Missing context fails closed below. */ }
  const summary = summarizeCacheCleanup(records, {jobStatus: process.env.CLEANUP_JOB_STATUS, steps})
  if (options['--json-output']) await writeFile(resolve(options['--json-output']), JSON.stringify(summary, null, 2) + '\n')
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, renderCacheCleanupSummary(summary))
  console.log(JSON.stringify(summary))
  if (summary.status !== 'completed') process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main() }
  catch {
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
      '## 운영 퇴역 페이지 캐시 정리\n\n상태: **실패**\n\n요약 보고서를 만들지 못했습니다. 삭제·보호·미분류·미처리 수량은 미확인입니다.\n').catch(() => {})
    console.error('Cache cleanup summary failed')
    process.exitCode = 1
  }
}
