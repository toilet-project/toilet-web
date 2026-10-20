import assert from 'node:assert/strict'
import test from 'node:test'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'next/link') return next('next/link.js', context)
    try { return next(specifier, context) } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.')) {
        for (const extension of ['.ts', '.tsx']) try { return next(specifier + extension, context) } catch {}
      }
      throw error
    }
  },
  load(url, context, next) {
    if (url.endsWith('.tsx')) return {
      format: 'module',
      source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      shortCircuit: true,
    }
    return next(url, context)
  },
})
const { HomeRouteBridge } = await import('../src/components/HomeRouteBridge.tsx')
const { MapRouteContext } = await import('../src/components/mapRouteContext.ts')
const { LocaleContext } = await import('../src/i18n/context.ts')
const { SUPPORTED_LOCALES } = await import('../src/i18n/locale.ts')
const { localizedPublicPath } = await import('../src/i18n/routes.ts')
const { message } = await import('../src/i18n/messages.ts')
hooks.deregister()

function render(locale, mounted) {
  return renderToStaticMarkup(React.createElement(LocaleContext.Provider, { value: locale },
    React.createElement(MapRouteContext.Provider, {
      value: { mounted, register: () => assert.fail('SSR cannot start map registration or requests') },
    }, React.createElement(HomeRouteBridge, { locale }))))
}

test('all language homes retain a server-rendered startup shell before the interactive map mounts', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const html = render(locale, false)
    assert.match(html, /class="app-shell has-mobile-navigation map-startup"/)
    assert.ok(html.includes(message(locale, 'map.loading')))
    assert.ok(html.includes(`href="${localizedPublicPath('/', locale)}"`))
    assert.ok(html.includes(`href="${localizedPublicPath('/regions', locale)}"`))
    assert.match(html, /type="search" disabled=""/)
    assert.doesNotMatch(html, /route-preview-card|public-reviews|<script/)
    assert.ok(html.includes(`rel="preconnect" href="https://${locale === 'ko' ? 'dapi.kakao.com' : 'oapi.map.naver.com'}"`))
    assert.equal(html.includes('href="https://t1.daumcdn.net"'), locale === 'ko')
    assert.equal(html.includes('href="https://dapi.kakao.com"'), locale === 'ko')
  }
})

test('mounting the interactive map removes the startup shell for every language', () => {
  for (const locale of SUPPORTED_LOCALES) assert.equal(render(locale, true), '')
})
