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
  for (const property of ['width: 90px;', 'min-width: 90px;', 'max-width: 90px;', 'height: 44px;', 'min-height: 44px;', 'border-radius: 13px;'])
    assert.ok(listRule.includes(property))
  assert.match(mobile, /\.map-filter-settings \{ border-radius: 11px; \}/)
  assert.match(mobile, /\.map-filter-controls \{[^}]*border-radius: 17px 0 0 17px;/)
  assert.match(mobile, /\.map-filter-controls \{[^}]*border-right: 0;/)
  assert.match(mobile, /\.map-filter-toolbar \{[^}]*right: 0;/)
  const iconRule = mobile.match(/\.map-filter-list-action \.mobile-area-list-button::before \{([^}]+)\}/)?.[1]
  assert.ok(iconRule)
  assert.ok(iconRule.includes('flex: 0 0 16px;'))
  assert.ok(iconRule.includes('width: 16px;'))
  assert.ok(iconRule.includes('justify-content: center;'))
})

test('both layouts keep a visible filter surface, larger chips and clear space for map overlays', () => {
  const css = readFileSync(new URL('../src/components/map-filters.css', import.meta.url), 'utf8')
  const surface = css.match(/\.map-filter-controls \{([^}]+)\}/)?.[1]
  assert.match(surface, /background: rgb\(255 255 255 \/ 98%\);/)
  assert.match(surface, /border: 1px solid #c3d4c8;/)
  assert.match(surface, /box-shadow: 0 5px 18px/)
  const mobile = css.slice(css.indexOf('@media (max-width: 640px)'))
  assert.doesNotMatch(mobile, /background: transparent|box-shadow: none/)
  assert.match(css, /\.map-filter-chip \{[^}]*height: 38px;/)
  assert.match(mobile, /\.map-filter-status \{ top: 70px;/)
  assert.match(mobile, /\.map-stage.has-map-filters \.map-hud \{ top: 70px; \}/)
})

test('compact filter tiles retain native checkbox semantics, visible selection and keyboard focus', () => {
  const css = readFileSync(new URL('../src/components/map-filters.css', import.meta.url), 'utf8')
  const component = readFileSync(new URL('../src/components/MapFilterBar.tsx', import.meta.url), 'utf8')
  assert.match(component, /className="map-filter-options-grid"/)
  assert.equal((component.match(/type="checkbox"/g) ?? []).length, 3)
  assert.equal((component.match(/<SelectionMark \/>/g) ?? []).length, 3)
  assert.match(component, /className="map-filter-selection-mark" aria-hidden="true"/)
  assert.match(css, /\.map-filter-option-wide \{ grid-column: 1 \/ -1;/)
  assert.match(css, /\.map-filter-option:has\(input:focus-visible\)/)
  assert.match(css, /\.map-filter-gender-option:has\(input:focus-visible\)/)
  assert.match(css, /input:checked \+ \.map-filter-selection-mark svg \{ opacity: 1;/)
  assert.match(css, /width: min\(304px, calc\(100vw - 24px\)\)/)
  assert.match(css, /\.map-filter-options \{ left: auto; right: 12px; \}/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})
