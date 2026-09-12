// Synthetic visualViewport geometry, not an actual iPhone keyboard acceptance.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright')
const origin = process.env.REVIEW_PREVIEW_ORIGIN || 'http://127.0.0.1:4187'
assert.ok(['http://127.0.0.1:4187', 'https://preview.geupddong.com'].includes(origin))
const output = process.env.REVIEW_SCREENSHOT_DIR || path.resolve('.tmp-review-screenshots')
fs.mkdirSync(output, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const width of [320, 390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 600, hasTouch: width < 600 })
      let writes = 0
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url())
        if (url.pathname === '/cdn-cgi/rum') return route.fulfill({ status: 204 })
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) { writes++; return route.abort() }
        return route.continue()
      })
      await context.addInitScript(() => {
        const viewport = new EventTarget()
        const state = { height: 844, offsetTop: 0, scale: 1 }
        for (const key of Object.keys(state)) Object.defineProperty(viewport, key, { get: () => state[key] })
        Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
        window.resizeReviewViewport = next => { Object.assign(state, next); viewport.dispatchEvent(new Event('resize')); viewport.dispatchEvent(new Event('scroll')) }
      })
      const page = await context.newPage(), errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(origin + '/review-preview', { waitUntil: 'networkidle' })
      const open = async () => {
        await page.getByRole('button', { name: '리뷰', exact: true }).click()
        const consent = page.getByRole('button', { name: '확인하고 리뷰 쓰기' })
        if (await consent.isVisible()) await consent.click()
      }
      await open()
      const text = page.getByLabel('한 줄 더 남겨주세요', { exact: false })
      await text.fill('키보드를 열어도 작성한 글은 유지돼요.')
      const settled = async () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))))
      const assertVisible = async () => {
        await settled()
        const box = await page.evaluate(() => {
          const body = document.querySelector('.rv-dialog-body').getBoundingClientRect()
          const input = document.querySelector('textarea').getBoundingClientRect()
          const card = document.querySelector('.rv-dialog').getBoundingClientRect()
          const viewport = window.visualViewport
          return { visible: input.top >= body.top + 10 && input.bottom <= body.bottom - 10, inViewport: card.top >= viewport.offsetTop && card.bottom <= viewport.offsetTop + viewport.height, overflow: document.querySelector('.rv-dialog').scrollWidth > document.querySelector('.rv-dialog').clientWidth }
        })
        assert.equal(box.visible, true, `textarea clipped ${width}: ${JSON.stringify(box)}`)
        assert.equal(box.inViewport, true, `card clipped ${width}`)
        assert.equal(box.overflow, false)
        assert.equal(await text.inputValue(), '키보드를 열어도 작성한 글은 유지돼요.')
      }
      for (const dimensions of [{ height: 500, offsetTop: 0 }, { height: 390, offsetTop: 90 }, { height: 340, offsetTop: 140 }]) {
        await page.evaluate(next => window.resizeReviewViewport(next), dimensions)
        await assertVisible()
      }
      await page.screenshot({ path: path.join(output, `review-keyboard-${width}.png`) })
      const beforeZoom = await page.locator('.rv-dialog-body').evaluate(el => el.scrollTop)
      await page.evaluate(() => window.resizeReviewViewport({ height: 250, offsetTop: 160, scale: 1.5 }))
      await settled()
      assert.equal(await page.locator('.rv-dialog-body').evaluate(el => el.scrollTop), beforeZoom, 'do not fight pinch zoom')
      await page.evaluate(() => window.resizeReviewViewport({ height: 844, offsetTop: 0, scale: 1 }))
      await assertVisible()
      await text.blur()
      await page.getByRole('button', { name: '닫기', exact: true }).click()
      await page.getByRole('button', { name: '그만두기', exact: true }).click()
      await page.waitForFunction(() => document.body.style.position !== 'fixed')
      // Detached listeners must not alter the page after the card closes.
      const before = await page.evaluate(() => ({ style: document.body.getAttribute('style'), y: scrollY }))
      await page.evaluate(() => window.resizeReviewViewport({ height: 390, offsetTop: 90 }))
      await settled()
      assert.deepEqual(await page.evaluate(() => ({ style: document.body.getAttribute('style'), y: scrollY })), before)
      await page.evaluate(() => window.resizeReviewViewport({ height: 844, offsetTop: 0 }))
      await open()
      await text.focus()
      await page.evaluate(() => window.resizeReviewViewport({ height: 390, offsetTop: 60 }))
      await settled()
      assert.equal(await text.inputValue(), '', 'new card has no abandoned draft')
      assert.equal(writes, 0); assert.deepEqual(errors, [])
      console.log(`PASS review keyboard ${width}: card-only input visibility, viewport resize/pan, zoom respected, content retained, cleanup/reopen; synthetic geometry; no writes`)
      await context.close()
    }
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
