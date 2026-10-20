import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { transpileModule, ModuleKind, JsxEmit } from 'typescript'
import { localizedPublicPath } from '../src/i18n/routes.ts'
import { SUPPORTED_LOCALES } from '../src/i18n/locale.ts'

const require = createRequire(import.meta.url)
const sources = {
  PrimaryNavigation: await readFile(new URL('../src/components/PrimaryNavigation.tsx', import.meta.url), 'utf8'),
  MobileNavigation: await readFile(new URL('../src/components/MobileNavigation.tsx', import.meta.url), 'utf8'),
}

// Exercise the actual navigation components and their event handlers. Only
// React's state scheduler and the Next Link boundary are replaced; no prefetch
// decision logic is duplicated here. Browser network behavior is checked in preview.
function mount(name, locale = 'ko') {
  const state = []
  let cursor = 0
  const Link = () => null
  const load = id => {
    if (id === 'next/link') return Link
    if (id === 'react') return { useState: initial => {
      const index = cursor++
      if (!(index in state)) state[index] = initial
      return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next }]
    } }
    if (id === '../i18n/context') return { useLocale: () => locale, useMessages: () => key => key }
    if (id === '../i18n/routes') return { localizedPublicPath }
    if (id === './HeaderIcon') return { HeaderIcon: () => null }
    if (id === './regions/regionText') return { regionText: () => ({ regions: 'Regions' }) }
    return require(id)
  }
  const { outputText } = transpileModule(sources[name], {
    compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX },
  })
  const component = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(load, component, component.exports)
  const defaults = name === 'PrimaryNavigation'
    ? { active: 'map' } : { tab: 'map', onChange: () => {}, unread: 0 }
  return props => {
    cursor = 0
    const tree = component.exports[name]({ ...defaults, ...props })
    function find(node) {
      if (!node || typeof node !== 'object') return null
      if (node.type === Link && node.props.href === localizedPublicPath('/regions', locale)) return node
      const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children]
      return children.map(find).find(Boolean)
    }
    const link = find(tree)
    assert.ok(link, 'the region destination remains a real Next Link')
    return link.props
  }
}

test('other navigation surfaces keep automatic region prefetch by default', () => {
  for (const name of Object.keys(sources)) assert.equal(mount(name)({}).prefetch, true)
})

test('the map can defer automatic region prefetch until its first result is ready', () => {
  for (const name of Object.keys(sources)) {
    const render = mount(name)
    assert.equal(render({ regionsPrefetch: false }).prefetch, false)
    assert.equal(render({ regionsPrefetch: true }).prefetch, true)
  }
})

test('mouse, keyboard focus and touch restore region prefetch before map readiness in every language', () => {
  for (const name of Object.keys(sources)) for (const locale of SUPPORTED_LOCALES) {
    for (const event of ['onMouseEnter', 'onFocus', 'onTouchStart']) {
      const render = mount(name, locale)
      const before = render({ regionsPrefetch: false })
      assert.equal(before.prefetch, false)
      before[event]()
      const interested = render({ regionsPrefetch: false })
      assert.equal(interested.prefetch, true)
      assert.equal(interested.href, before.href)
    }
  }
})

test('the region page does not prefetch its own active navigation destination', () => {
  const render = mount('PrimaryNavigation')
  const link = render({ active: 'regions', regionsPrefetch: true })
  assert.equal(link.prefetch, false)
  link.onFocus()
  assert.equal(render({ active: 'regions', regionsPrefetch: true }).prefetch, false)
})
