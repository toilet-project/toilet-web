import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('compact account controls are scoped to account pages, not the shared inbox or map', async () => {
  const [mobile, desktop, layout, css] = await Promise.all([
    read('src/components/MobilePage.tsx'), read('src/components/AccountWorkspaceFrame.tsx'),
    read('src/app/layout.tsx'), read('src/components/account-controls.css'),
  ])
  assert.ok(mobile.includes("tab === 'account' ? ' account-controls' : ''"))
  assert.ok(desktop.includes("view !== 'notifications' ? ' account-controls' : ''"))
  assert.ok(layout.indexOf("import '../components/account-controls.css'") > layout.indexOf("import '../components/history.css'"))
  assert.ok(!css.includes('!important'))
  assert.ok(!css.includes('.history-close')) // Preserve the established title/close alignment.
  assert.ok(!css.includes('.history-calendar-grid')) // Keep calendar-day and keyboard targets intact.
})

test('account density keeps native select semantics and touch targets without fixed text clipping', async () => {
  const [css, liked] = await Promise.all([read('src/components/account-controls.css'), read('src/components/LikedToiletsPanel.tsx')])
  assert.match(css, /--account-control-height: 32px/)
  assert.match(css, /\.liked-sort-field select \{ position: relative; min-height: 44px;/)
  assert.match(css, /inset: -6px 0/)
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\) minmax\(64px, \.65fr\)/)
  assert.match(liked, /<select id="liked-sort" value=\{sort\}/)
  assert.ok(!css.includes('overflow: hidden'))
})
