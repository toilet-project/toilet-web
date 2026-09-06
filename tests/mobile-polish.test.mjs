import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

const source = async path => readFile(new URL(path, import.meta.url), 'utf8')

test('mobile search has no focus-dependent expansion and clears focus state on blur', async () => {
  const app = await source('../src/App.tsx')
  const css = await source('../src/components/mobile-navigation.css')
  assert.doesNotMatch(app + css, /is-mobile-searching|mobile-search-close/)
  assert.match(app, /onBlur=\{\(\) => setIsPlaceSearchFocused\(false\)\}/)
  assert.match(css, /place-search-input\s*\{[^}]*font-size: 16px/)
})

test('all mobile map sheets reserve the same upper control area', async () => {
  const css = await source('../src/components/mobile-navigation.css')
  assert.match(css, /\.has-mobile-navigation \.place-card, \.has-mobile-navigation \.coordinate-group-card, \.has-mobile-navigation \.mobile-area-list\s*\{ max-height: calc\(100% - 80px\); \}/)
  assert.match(css, /max-height: min\(280px, calc\(100% - 80px\)\)/)
})

test('report login prompt uses brand and concise labels without removing the auth gate', async () => {
  const app = await source('../src/App.tsx')
  assert.doesNotMatch(app, /로그인 후 정보 제보하기/)
  assert.match(app, /aria-label="정보 제공하기" title="정보 제공하기"/)
  assert.equal((app.match(/<ReportEntryButton onClick=/g) || []).length, 2)
  assert.match(app, /className="brand login-brand">급똥/)
  assert.match(app, /const title = '로그인 · 간편가입'/)
})

test('community shows a one-second notice without navigating or reserving subtitle space', async () => {
  const nav = await source('../src/components/MobileNavigation.tsx')
  const css = await source('../src/components/mobile-navigation.css')
  assert.doesNotMatch(nav, /coming soon/)
  assert.match(nav, /onClick=\{showCommunityNotice\}/)
  assert.match(nav, /준비 중이에요/)
  assert.match(nav, /setTimeout\([^\n]+, 1000\)/)
  assert.match(nav, /clearTimeout\(noticeTimer.current\)/)
  assert.match(nav, /role="status" aria-live="polite"/)
  assert.doesNotMatch(css, /last-of-type\s*\{\s*height: 23px/)
})

test('compact navigation retains readable labels, touch targets and safe-area padding', async () => {
  const css = await source('../src/components/mobile-navigation.css')
  assert.match(css, /\.mobile-navigation button\s*\{[^}]*min-height: 52px/)
  assert.match(css, /max\(2px, env\(safe-area-inset-bottom\)\)/)
  assert.match(css, /\.mobile-navigation button\s*\{[^}]*font-size: 11px/)
})

test('future toilet metrics are placeholders in a 44px row, with a labeled report action', async () => {
  const app = await source('../src/App.tsx')
  const css = await source('../src/components/mobile-navigation.css')
  for (const label of ['평점: 준비 중', '혼잡도: 준비 중', '휴지 있음 비율: 준비 중']) assert.ok(app.includes(label))
  assert.match(app, /<span>제보<\/span>/)
  assert.match(css, /\.toilet-community-row\s*\{[^}]*height: 44px/)
  assert.match(css, /\.toilet-community-row\s*\{[^}]*display: flex/)
  assert.match(css, /\.toilet-community-metric\s*\{[^}]*align-items: flex-start[^}]*text-align: left/)
  assert.match(css, /\.toilet-community-metric\s*\{[^}]*flex: 1 1 auto/)
  assert.match(css, /\.report-entry-button\.report-icon-button\s*\{[^}]*flex: 0 0 44px[^}]*margin: 0 0 0 12px/)
  assert.match(css, /\.toilet-community-row\s*\{[^}]*container-type: inline-size/)
  assert.match(css, /@container \(max-width: 240px\)[\s\S]*padding-right: 4px[\s\S]*padding-left: 4px[\s\S]*margin-left: 4px/)
  assert.match(css, /\.toilet-community-row\s*\{[^}]*background: transparent/)
  assert.match(css, /toilet-community-metric::before[^}]*width: 1px/)
  assert.match(css, /metric-star\s*\{ color: #b88524/)
  assert.match(app, /className="metric-paper"/)
  assert.match(app, /m13 12-4 1 1-4 7-7 3 3-7 7Z/)
})
