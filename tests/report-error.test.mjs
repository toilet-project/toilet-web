import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { reportReadErrorMessage } from '../src/lib/report-error.ts'

test('network failures show actionable Korean guidance', () => {
  assert.match(reportReadErrorMessage(new TypeError('Failed to fetch')), /인터넷 연결/)
  assert.match(reportReadErrorMessage(new TypeError('Load failed')), /다시 불러와/)
})
test('authentication failure remains distinct', () => {
  assert.equal(reportReadErrorMessage(new Error('로그인이 필요합니다.')), '로그인이 필요합니다.')
})
test('unexpected server details are not displayed', () => {
  for (const value of [new Error('private server detail'), null, {}, 'private']) {
    assert.equal(reportReadErrorMessage(value), '내 제보를 불러오지 못했어요. 잠시 후 다시 불러와 주세요.')
  }
})
test('report panel exposes a read-only retry and guards stale completion', () => {
  const source=readFileSync(new URL('../src/components/MyReportsPanel.tsx', import.meta.url),'utf8')
  assert.match(source,/onClick=\{retryReports\}/)
  assert.match(source,/if \(isLoading\) return/)
  assert.match(source,/setError\(null\)/)
  assert.match(source,/\[requestVersion\]/)
  assert.match(source,/return \(\) => \{ active = false \}/)
  assert.doesNotMatch(source,/createToiletReport|method:\s*['"]POST/)
})

test('retry design keeps guidance and touch-friendly action in one centered group', () => {
  const source = readFileSync(new URL('../src/components/MyReportsPanel.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8')
  assert.match(source, /className="my-reports-retry-message" role="alert"/)
  assert.match(source, /className="my-reports-retry-icon" aria-hidden="true"/)
  assert.match(css, /\.my-reports-retry \{[^}]*align-items: center;[^}]*gap: 16px;/)
  assert.match(css, /\.my-reports-retry-message \{[^}]*padding: 0;/)
  assert.match(css, /\.my-reports-retry-button \{[^}]*min-height: 44px;/)
  assert.match(css, /\.my-reports-retry-button:focus-visible/)
})
