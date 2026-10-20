import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createRequire, registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { setImmediate } from 'node:timers/promises'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { createClientModuleLoader } from '../src/lib/clientModuleLoader.ts'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')

test('home detail reset does not discard a newly opened area list', async () => {
  const app = await read('src/App.tsx')
  const reset = app.slice(app.indexOf('const resetDetailCard ='), app.indexOf('const closeDetailCard ='))
  assert.doesNotMatch(reset, /setIsMobileAreaListOpen/)
  assert.match(app, /isMobileAreaListVisible = isMobileAreaListOpen && !route.detail/)
  assert.match(app, /isMobileAreaListVisible && <aside/)
})

test('map remains owned by a shared layout and browser-only shell', async () => {
  const layout = await read('src/app/(map)/layout.tsx')
  assert.match(layout, /<MapShell>\{children\}<\/MapShell>/)
  assert.doesNotMatch(layout, /key=|usePathname|useParams/)
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
        format: 'module', shortCircuit: true,
        source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext },
        }).outputText,
      }
      return next(url, context)
    },
  })
  let HomeRouteBridge, routeContext, localeContext, routes, locales
  try {
    ;({ HomeRouteBridge } = await import('../src/components/HomeRouteBridge.tsx'))
    routeContext = await import('../src/components/mapRouteContext.ts')
    localeContext = await import('../src/i18n/context.ts')
    routes = await import('../src/i18n/routes.ts')
    locales = await import('../src/i18n/locale.ts')
  } finally { hooks.deregister() }

  const require = createRequire(import.meta.url)
  let factoryCalls = 0, appImports = 0, appRenders = 0
  const phases = []
  const forbidden = () => assert.fail('Browser work cannot run during SSR')
  const dependencies = {
    'next/navigation': { useRouter: () => ({ push: forbidden, replace: forbidden }) },
    './mapRouteContext': routeContext,
    '../lib/toiletRoute': { toiletPath: forbidden },
    '../lib/reviewTestToilet': { getReviewTestHash: forbidden, subscribeReviewTestHash: forbidden },
    '../i18n/routes': routes,
    '../i18n/locale': { rememberLocale: forbidden },
    '../i18n/loginReturn': { consumeLanguageLoginReturn: forbidden },
    '../i18n/feature': { ENGLISH_UI_ENABLED: true },
    '../lib/navigationCache': { MAP_NAVIGATION_EVENT: 'map-navigation' },
    '../lib/mapProvider': { loadedNaverMapLanguage: forbidden, prepareMapSdk: forbidden },
    '../lib/mapProviderSelection': { naverMapLanguageForLocale: forbidden, naverMapLanguageNeedsReload: forbidden },
    '../i18n/context': localeContext,
    '../i18n/messages': { message: forbidden },
    '../lib/mapTiming': { markMapTiming: phase => phases.push(phase), beginMapTiming: () => () => {} },
    '../lib/clientModuleLoader': { createClientModuleLoader: factory => createClientModuleLoader(() => {
      factoryCalls++
      return factory()
    }) },
  }
  function compile(source, load) {
    const module = { exports: {} }
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
    })
    new Function('require', 'module', 'exports', outputText)(load, module, module.exports)
    return module.exports
  }
  const { MapShell } = compile(await read('src/components/MapShell.tsx'), id => {
    if (id === '../App') {
      appImports++
      return { __esModule: true, default: () => { appRenders++; return React.createElement('div', null, 'map') } }
    }
    return Object.hasOwn(dependencies, id) ? dependencies[id] : require(id)
  })
  const { default: MapLayout } = compile(layout, id => id === '../../components/MapShell' ? { MapShell } : require(id))
  for (const locale of locales.SUPPORTED_LOCALES) {
    let context
    function InitialRoute() {
      context = routeContext.useMapRouteContext()
      return React.createElement(React.Fragment, null,
        React.createElement('span', { id: 'initial-route-child' }, 'retained'),
        React.createElement(HomeRouteBridge, { locale }))
    }
    const html = renderToStaticMarkup(React.createElement(localeContext.LocaleContext.Provider, { value: locale },
      React.createElement(MapLayout, null, React.createElement(InitialRoute))))
    assert.match(html, /id="initial-route-child">retained/)
    assert.match(html, /class="app-shell has-mobile-navigation map-startup"/)
    assert.match(html, /type="search" disabled=""/)
    assert.equal(context.mounted, false)
    assert.equal(typeof context.register, 'function')
  }
  await setImmediate() // Observe an accidentally started async import as well.
  assert.equal(factoryCalls, 0)
  assert.equal(appImports, 0)
  assert.equal(appRenders, 0)
  assert.equal(phases.includes('route-registered'), false)
})

test('root and policy pages remain server components', async () => {
  for (const file of ['src/app/layout.tsx', 'src/app/policies/[kind]/page.tsx']) {
    assert.doesNotMatch(await read(file), /['"]use client['"]|window\.|document\./)
  }
})

test('preview configuration cannot claim the production domain', async () => {
  const config = JSON.parse(await read('wrangler.jsonc'))
  assert.equal(config.name, 'geupddong-web-preview')
  assert.deepEqual(config.routes, [{pattern:'preview.geupddong.com',custom_domain:true}])
  assert.equal(config.route, undefined)
  assert.equal(config.services[0].service, config.name)
  assert.equal(config.r2_buckets[0].bucket_name, 'geupddong-next-preview-cache')
  // Free preview uses account defaults; a Paid-only CPU override must not creep in.
  assert.equal(config.limits?.cpu_ms, undefined)
  assert.equal(config.vars.SITE_INDEXABLE, 'false')
})

test('marker image preserves the existing SVG asset', async () => {
  assert.equal((await read('public/toilet-marker-logo.svg')).replace(/\r/g, '').trim(),
    (await read('src/assets/toilet-marker-logo.svg')).replace(/\r/g, '').trim())
})

test('only policy pages are pre-generated; no nationwide detail build', async () => {
  const policy = await read('src/app/policies/[kind]/page.tsx')
  assert.match(policy, /Object.keys\(titles\)/)
  assert.doesNotMatch(await read('src/app/(map)/page.tsx'), /generateStaticParams/)
})
