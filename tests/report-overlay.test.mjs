import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('facility reporting uses the browser modal top layer outside the map/card tree', async () => {
  const source = await readFile(new URL('../src/components/ToiletReportModal.tsx', import.meta.url), 'utf8')
  assert.match(source, /createPortal\(<dialog/)
  assert.match(source, /<\/dialog>, document\.body\)/)
  assert.match(source, /useRef<HTMLDialogElement>/)
  assert.match(source, /dialog\.showModal\(\)/)
  assert.match(source, /aria-modal="true" aria-labelledby="report-modal-title"/)
  assert.match(source, /onCancel=\{event => \{ event\.preventDefault\(\); onClose\(\) \}\}/)
  assert.match(source, /attachReportViewport\(dialog\)/)
  assert.match(source, /return \(\) => \{ detachViewport\(\); dialog\.close\(\) \}/)
  assert.match(source, /if \(typeof document === 'undefined'\) return null/)
  assert.doesNotMatch(source, /<section[^>]+role="dialog"/)
})

test('native report dialog resets UA sizing without changing keyboard viewport bounds', async () => {
  const css = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')
  const shell = css.match(/\.report-modal-backdrop \{([^}]+)\}/)?.[1] || ''
  for (const declaration of ['position: fixed', 'bottom: auto', 'width: 100%', 'max-width: none', 'max-height: none', 'margin: 0', 'border: 0']) {
    assert.ok(shell.includes(declaration), declaration)
  }
  assert.match(shell, /top: var\(--report-viewport-top, 0px\)/)
  assert.match(shell, /height: var\(--report-viewport-height, 100dvh\)/)
  assert.match(css, /\.report-modal-backdrop:not\(\[open\]\) \{ display: none; \}/)
  assert.match(css, /\.report-modal-backdrop::backdrop \{ background:/)
  assert.match(css, /\.report-modal-content \{[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;/)
})
