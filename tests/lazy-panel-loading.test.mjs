import assert from 'node:assert/strict'
import test from 'node:test'
import { registerHooks } from 'node:module'
import { readFileSync } from 'node:fs'
import { PassThrough } from 'node:stream'
import ts from 'typescript'
import React from 'react'
import { renderToString, renderToStaticMarkup, renderToPipeableStream } from 'react-dom/server'

const hooks = registerHooks({
  resolve(specifier, context, next) {
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
        compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText,
    }
    return next(url, context)
  },
})
const { createLazyPanel } = await import('../src/lib/createLazyPanel.ts')
const { PublicReviewsFallback } = await import('../src/components/reviews/PublicReviewsLoading.tsx')
const { PolicyConsentFallback, AccountRecoveryFallback } = await import('../src/components/AccountGateFallback.tsx')
const { LocaleContext } = await import('../src/i18n/context.ts')
const { message } = await import('../src/i18n/messages.ts')
hooks.deregister()

function localized(child) {
  return React.createElement(LocaleContext.Provider, { value: 'ko' }, child)
}

function stream(child) {
  return new Promise((resolve, reject) => {
    const output = new PassThrough()
    let html = ''
    output.setEncoding('utf8')
    output.on('data', chunk => { html += chunk })
    output.on('end', () => resolve(html))
    output.on('error', reject)
    const rendering = renderToPipeableStream(child, {
      onAllReady() { rendering.pipe(output) },
      onError: reject,
    })
  })
}

test('closed panels do not load; requested public reviews keep an inline skeleton and forward props when ready', async () => {
  const old = process.env.NEXT_PUBLIC_PUBLIC_REVIEW_API_ENABLED
  process.env.NEXT_PUBLIC_PUBLIC_REVIEW_API_ENABLED = 'true'
  try {
    let calls = 0, finish
    const Panel = createLazyPanel(() => {
      calls++
      return new Promise(resolve => { finish = resolve })
    }, false, onRetry => React.createElement(PublicReviewsFallback, { onRetry }))
    assert.equal(calls, 0, 'declaring the panel must not import its UI')
    const pending = renderToString(localized(React.createElement(Panel, { toiletId: 128 })))
    assert.equal(calls, 1)
    assert.match(pending, /public-reviews is-loading/)
    assert.doesNotMatch(pending, /class="mobile-page|role="dialog"|account-backdrop/)
    finish({ default: ({ toiletId }) => React.createElement('article', { 'data-toilet': toiletId }, 'reviews') })
    const ready = await stream(localized(React.createElement(Panel, { toiletId: 128 })))
    assert.match(ready, /data-toilet="128"/)
    assert.doesNotMatch(ready, /is-loading|role="dialog"/)
    assert.equal(calls, 1, 'the ready module is shared across mounts')
  } finally {
    if (old === undefined) delete process.env.NEXT_PUBLIC_PUBLIC_REVIEW_API_ENABLED
    else process.env.NEXT_PUBLIC_PUBLIC_REVIEW_API_ENABLED = old
  }
})

test('an inline review chunk failure exposes a local retry without taking over the map', () => {
  const html = renderToStaticMarkup(localized(React.createElement(PublicReviewsFallback, { onRetry: () => {} })))
  assert.match(html, /class="public-review-error" role="alert"/)
  assert.ok(html.includes(message('ko', 'common.retry')))
  assert.doesNotMatch(html, /mobile-page|account-backdrop|role="dialog"/)
})

test('required account fallbacks retain explicitly named exits while loading and after a chunk failure', () => {
  const consent = props => renderToStaticMarkup(localized(React.createElement(PolicyConsentFallback, {
    isNewRegistration: true, onLogout: () => {}, ...props,
  })))
  const recovery = props => renderToStaticMarkup(localized(React.createElement(AccountRecoveryFallback, props)))
  for (const retry of [undefined, () => {}]) {
    const consentHtml = consent({ onRetry: retry })
    const recoveryHtml = recovery({ onRetry: retry })
    assert.ok(consentHtml.includes(message('ko', 'consent.logout')))
    assert.ok(recoveryHtml.includes(message('ko', 'recovery.notNow')))
    assert.doesNotMatch(consentHtml, /login-modal-close|aria-label="닫기"/)
    assert.doesNotMatch(recoveryHtml, /login-modal-close|aria-label="닫기"/)
    assert.ok(!recoveryHtml.includes(message('ko', 'consent.logout')), 'recovery cancellation must not be labeled logout')
    if (retry) {
      assert.ok(consentHtml.includes(message('ko', 'error.retry')))
      assert.ok(recoveryHtml.includes(message('ko', 'error.retry')))
    }
  }
})

test('a custom lazy fallback receives current account callbacks rather than retaining a former render scope', () => {
  const seen = []
  const Panel = createLazyPanel(() => new Promise(() => {}), true, (onRetry, props) => {
    seen.push(props.onLogout)
    return React.createElement(PolicyConsentFallback, { ...props, onRetry })
  })
  const former = () => {}, current = () => {}
  renderToString(localized(React.createElement(Panel, { isNewRegistration: true, onLogout: former })))
  const split = seen.length
  renderToString(localized(React.createElement(Panel, { isNewRegistration: false, onLogout: current })))
  assert.ok(split > 0)
  assert.ok(seen.slice(0, split).every(value => value === former))
  assert.ok(seen.slice(split).length > 0)
  assert.ok(seen.slice(split).every(value => value === current))
})
