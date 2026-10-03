import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { mapFilterCopy, mapFilterCountLabel } from '../src/i18n/mapFilterCopy.ts'

test('mobile map list count caps only the button label above 99', () => {
  for (const count of [0, 1, 9, 10, 98, 99]) assert.equal(mapFilterCountLabel(count), String(count))
  for (const count of [100, 101, 1000, 50631]) assert.equal(mapFilterCountLabel(count), '99+')
})

test('all six locales retain a compact list label alongside the capped count', () => {
  assert.equal(Object.keys(mapFilterCopy).length, 6)
  for (const copy of Object.values(mapFilterCopy)) {
    assert.ok(copy.list)
    assert.ok(copy.list.length <= 4)
    assert.ok(`${copy.list} (${mapFilterCountLabel(50631)})`.endsWith('(99+)'))
  }
})

test('mobile list and settings keep fixed rounded-rectangle geometry outside the scroll strip', () => {
  const css = readFileSync(new URL('../src/components/map-filters.css', import.meta.url), 'utf8')
  const mobile = css.slice(css.indexOf('@media (max-width: 640px)'))
  const listRule = mobile.match(/\.map-filter-list-action \.mobile-area-list-button \{([^}]+)\}/)?.[1]
  assert.ok(listRule)
  for (const property of ['width: 100px;', 'min-width: 100px;', 'max-width: 100px;', 'border-radius: 10px;'])
    assert.ok(listRule.includes(property))
  assert.match(mobile, /\.map-filter-settings \{ border-radius: 10px; \}/)
  assert.match(mobile, /\.map-filter-controls \{[^}]*padding: 0;/)
  assert.match(mobile, /\.map-filter-toolbar \{[^}]*right: 0;/)
  const iconRule = mobile.match(/\.map-filter-list-action \.mobile-area-list-button::before \{([^}]+)\}/)?.[1]
  assert.ok(iconRule)
  assert.ok(iconRule.includes('flex: 0 0 16px;'))
  assert.ok(iconRule.includes('width: 16px;'))
  assert.ok(iconRule.includes('justify-content: center;'))
})
