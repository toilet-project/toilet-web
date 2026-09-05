import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {MOBILE_LAYOUT_QUERY,DESKTOP_LAYOUT_QUERY} from '../src/lib/responsiveLayout.ts'

test('CSS and interactive map use the same phone/desktop queries', async()=>{
  const css=await readFile(new URL('../src/App.css',import.meta.url),'utf8')
  const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8')
  assert.ok(css.includes('@media '+MOBILE_LAYOUT_QUERY))
  assert.ok(css.includes('@media '+DESKTOP_LAYOUT_QUERY))
  assert.doesNotMatch(css,/@media \(min-width: 641px\)\s*\{/)
  assert.doesNotMatch(app,/matchMedia\('\(min-width: 641px\)'\)/)
})

test('report toolbar is outside the scrolling body and user zoom remains allowed', async()=>{
  const source=await readFile(new URL('../src/components/ToiletReportModal.tsx',import.meta.url),'utf8')
  assert.match(source,/<\/header>\s*<div ref=\{contentRef\} className="report-modal-content">/)
  const layout=await readFile(new URL('../src/app/layout.tsx',import.meta.url),'utf8')
  assert.doesNotMatch(layout,/userScalable:\s*false|maximumScale:\s*1/)
})
