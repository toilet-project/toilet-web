// Real component in a loopback-only harness: no production requests, accounts or map writes.
const assert = require('node:assert/strict')
const http = require('node:http')
const { readFileSync } = require('node:fs')
const esbuild = require(require.resolve('esbuild', { paths: [require.resolve('wrangler')] }))
const { chromium, webkit, devices } = require(process.env.PLAYWRIGHT_MODULE_PATH)

async function main() {
  const bundle = await esbuild.build({
    stdin: { contents: `import React, {useState} from 'react'; import {createRoot} from 'react-dom/client';
      import {LanguageSelector} from './src/components/LanguageSelector';
      function Test() { const [locale,setLocale]=useState('ko'); return <><button id="before">Before</button>
        <LanguageSelector locale={locale} onSelect={setLocale}/><output>{locale}</output><button id="after">After</button></> }
      createRoot(document.getElementById('root')).render(<Test/>);`, loader: 'tsx', resolveDir: process.cwd() },
    bundle: true, write: false, jsx: 'automatic', loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  const server = http.createServer((req, res) => {
    if (req.url === '/app.js') { res.setHeader('content-type', 'application/javascript'); res.end(bundle.outputFiles[0].contents); return }
    if (['/flags/kr.svg', '/flags/us.svg'].includes(req.url)) {
      res.setHeader('content-type', 'image/svg+xml'); res.end(readFileSync(`public${req.url}`)); return
    }
    res.setHeader('content-type', 'text/html')
    res.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${readFileSync('src/components/language-selector.css', 'utf8')}.language-selector{margin:16px 160px}</style><div id="root"></div><script src="/app.js"></script>`)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  try {
    for (const [name, engine, launch] of [['webkit', webkit, {}], ['chromium', chromium, { channel: 'chrome' }]]) {
      const browser = await engine.launch({ ...launch, headless: true })
      try {
        const context = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' })
        await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
        const page = await context.newPage()
        page.setDefaultTimeout(4000)
        const errors = [], events = []
        page.on('pageerror', error => errors.push(error.message))
        await page.exposeFunction('recordSelectorEvent', value => events.push(value))
        await page.addInitScript(() => {
          for (const type of ['pointerdown','pointerup','touchend','mousedown','mouseup','focusout','click']) document.addEventListener(type, e => {
            window.recordSelectorEvent({ type, target: e.target.tagName + ':' + e.target.textContent, related: e.relatedTarget?.textContent ?? null })
          }, true)
        })
        await page.goto(origin)
        const trigger = page.locator('.language-selector-trigger')
        try {
          for (const [label, locale] of [['English','en'], ['한국어','ko'], ['English','en']]) {
            await trigger.tap()
            await page.getByRole('menuitemradio', { name: label, exact: true }).tap()
            await page.waitForFunction(value => document.querySelector('output').textContent === value, locale)
            assert.equal(await page.getByRole('menu').count(), 0)
          }
          // A second tap toggles closed; touching elsewhere also dismisses it.
          await trigger.tap(); await trigger.tap()
          assert.equal(await page.getByRole('menu').count(), 0)
          await trigger.tap(); await page.locator('#after').tap()
          assert.equal(await page.getByRole('menu').count(), 0)
          // Hardware-keyboard behavior remains usable on tablets/desktops.
          await trigger.focus(); await page.keyboard.press('ArrowDown')
          assert.equal(await page.getByRole('menuitemradio', { name: 'English' }).evaluate(node => node === document.activeElement), true)
          await page.keyboard.press('Home'); await page.keyboard.press('Enter')
          assert.equal(await page.locator('output').innerText(), 'ko')
          await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape')
          assert.equal(await trigger.evaluate(node => node === document.activeElement), true)
          await page.keyboard.press('ArrowDown'); await page.locator('#after').focus()
          assert.equal(await page.getByRole('menu').count(), 0)
          await trigger.focus(); await page.keyboard.press('ArrowDown')
          await page.keyboard.press('End'); await page.keyboard.press('Tab')
          assert.equal(await page.getByRole('menu').count(), 0)
          assert.equal(await page.locator('#after').evaluate(node => node === document.activeElement), true)
          // Touch + keyboard may coexist: focused item -> tap the other item.
          await trigger.focus(); await page.keyboard.press('ArrowDown')
          await page.getByRole('menuitemradio', { name: 'English' }).tap()
          await page.waitForFunction(() => document.querySelector('output').textContent === 'en')
          await trigger.focus(); await page.keyboard.press('ArrowDown')
          await page.evaluate(() => document.activeElement.blur())
          assert.equal(await page.getByRole('menu').count(), 0, 'ordinary null-target blur still closes')
          await trigger.focus(); await page.keyboard.press('ArrowDown')
          await page.getByRole('menuitemradio', { name: 'English' }).dispatchEvent('pointerdown')
          await page.getByRole('menuitemradio', { name: 'English' }).dispatchEvent('pointercancel')
          await page.evaluate(() => document.activeElement.blur())
          assert.equal(await page.getByRole('menu').count(), 0, 'cancelled gesture releases blur guard')
          assert.deepEqual(errors, [])
          console.log(`PASS ${name}: repeated touch selection, toggle/outside, keyboard, mixed input`)
        } catch (error) { console.error(name, JSON.stringify(events.slice(-24)), await page.locator('#root').innerText()); throw error }
      } finally { await browser.close() }
    }
  } finally { await new Promise(resolve => server.close(resolve)) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
