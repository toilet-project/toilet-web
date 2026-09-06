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
  assert.equal((app.match(/>정보 제공하기<\/button>/g) || []).length, 2)
  assert.match(app, /className="brand login-brand">급똥/)
  assert.match(app, /const title = '로그인 · 간편가입'/)
})

test('community availability text belongs to the label, not a floating border badge', async () => {
  const nav = await source('../src/components/MobileNavigation.tsx')
  const css = await source('../src/components/mobile-navigation.css')
  assert.match(nav, /<span>커뮤니티<small>coming soon<\/small><\/span>/)
  const rule = css.match(/\.mobile-navigation small\s*\{([^}]+)\}/)?.[1]
  assert.ok(rule)
  assert.doesNotMatch(rule, /position: absolute|top: -/)
})
