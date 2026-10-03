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
  assert.match(mobile, /\.map-filter-controls \{[^}]*border: 0; border-radius: 0;/)
  assert.match(mobile, /\.map-filter-controls \{[^}]*padding: 5px 0 5px 7px;/)
  assert.match(mobile, /\.map-filter-toolbar \{[^}]*right: 0;/)
  const iconRule = mobile.match(/\.map-filter-list-action \.mobile-area-list-button::before \{([^}]+)\}/)?.[1]
  assert.ok(iconRule)
  assert.ok(iconRule.includes('flex: 0 0 16px;'))
  assert.ok(iconRule.includes('width: 16px;'))
  assert.ok(iconRule.includes('justify-content: center;'))
})

test('desktop retains its surface while mobile shows only individual chips and preserves overlay spacing', () => {
  const css = readFileSync(new URL('../src/components/map-filters.css', import.meta.url), 'utf8')
  const surface = css.match(/\.map-filter-controls \{([^}]+)\}/)?.[1]
  assert.match(surface, /background: rgb\(255 255 255 \/ 98%\);/)
  assert.match(surface, /border: 1px solid #d6dbe1;/)
  assert.match(surface, /box-shadow: 0 5px 18px/)
  const mobile = css.slice(css.indexOf('@media (max-width: 640px)'))
  assert.match(mobile, /\.map-filter-controls \{[^}]*background: transparent; box-shadow: none;/)
  assert.match(css, /\.map-filter-chip \{[^}]*border: 1px solid #dce1e7;[^}]*background: #fff; box-shadow:/)
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
  assert.match(css, /\.map-filter-options-grid \{[^}]*repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(component, /className="map-filter-accessibility-options" data-filter-tone="accessible"/)
  assert.match(css, /\.map-filter-option:has\(input:focus-visible\)/)
  assert.match(css, /\.map-filter-gender-option:has\(input:focus-visible\)/)
  assert.match(css, /input:checked \+ \.map-filter-selection-mark svg \{ opacity: 1;/)
  assert.match(css, /width: min\(312px, calc\(100vw - 24px\)\)/)
  assert.match(css, /\.map-filter-options \{ left: auto; right: 12px; \}/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
})

test('filter tones retain readable selected text and bolder icons without changing filter keys', () => {
  const css = readFileSync(new URL('../src/components/map-filters.css', import.meta.url), 'utf8')
  const component = readFileSync(new URL('../src/components/MapFilterBar.tsx', import.meta.url), 'utf8')
  const luminance = hex => hex.match(/[\da-f]{2}/gi).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0)
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)
  const tones = [...css.matchAll(/\[data-filter-tone="(\w+)"\] \{ --filter-accent: (#[\da-f]{6}); --filter-soft: (#[\da-f]{6});/g)]
  assert.deepEqual(tones.map(match => match[1]), ['mine', 'hours', 'cctv', 'diaper', 'bell', 'accessible'])
  for (const [, key, accent, soft] of tones) {
    assert.ok(contrast(accent, soft) >= 4.5, `${key} selected text`)
    assert.ok(contrast(accent, '#ffffff') >= 4.5, `${key} icon and check`)
  }
  assert.match(component, /strokeWidth="2.2"/)
  assert.match(css, /\.map-filter-chip \{[^}]*font-size: 13px; font-weight: 750;/)
  assert.match(css, /\.map-filter-chip svg \{ width: 18px; height: 18px;/)
  assert.match(css, /\.map-filter-chip\[aria-pressed="true"\] \{[^}]*color: var\(--filter-accent\)/)
})
