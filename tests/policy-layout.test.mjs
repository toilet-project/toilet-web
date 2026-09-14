import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('current policy pages use one responsive document hierarchy', async () => {
  const [page, styles, mobileStyles, icons] = await Promise.all([
    read('../src/components/PolicyPage.tsx'),
    read('../src/App.css'),
    read('../src/components/mobile-navigation.css'),
    read('../public/icons.svg'),
  ])
  assert.match(page, /policy-document-header/)
  assert.match(page, /policy-combined-header/)
  assert.match(page, /const SectionHeading = embedded \? 'h3' : 'h2'/)
  assert.match(page, /className="policy-history-link" href="\/policy-history\/2026-09-01\.html"/)
  assert.match(styles, /\.policy-document-header > h1[^}]*line-height: 1\.28/)
  assert.match(styles, /word-break: keep-all/)
  assert.match(styles, /\.policy-combined-header > h2/)
  assert.match(styles, /\.policy-combined-body > section:first-child/)
  assert.doesNotMatch(mobileStyles, /\.policy-combined-section/)
  assert.doesNotMatch(page, /github/i)
  assert.doesNotMatch(icons, /github/i)
})

test('archived policy keeps the exact public URL contract in a readable responsive shell', async () => {
  const archive = await read('../public/policy-history/2026-09-01.html')
  assert.match(archive, /<meta name="robots" content="noindex">/)
  assert.match(archive, /class="policy-archive-notice"/)
  assert.match(archive, /href="\/policies\/all">현재 정책 확인/)
  assert.match(archive, /id="terms"/)
  assert.match(archive, /id="privacy"/)
  assert.match(archive, /id="location"/)
  assert.match(archive, /소셜 연결 정보와 로그인 세션이 폐기됩니다/)
  assert.match(archive, /\.policy-document>h1[^}]*line-height:1\.28/)
  assert.match(archive, /@media\(max-width:640px\)/)
  assert.doesNotMatch(archive, /github|toilet-web|github\.com/i)
})
