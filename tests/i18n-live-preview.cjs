// Read-only real preview check. Fresh browser; no account, real GPS or write requests.
const assert = require('node:assert/strict')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH)
const origin = 'https://preview.geupddong.com'
async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
    const writes = [], errors = []
    await context.route('**/*', route => {
      if (!['GET', 'HEAD'].includes(route.request().method())) {
        writes.push(new URL(route.request().url()).pathname)
        return route.abort()
      }
      return route.continue()
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(origin + '/en/toilet/13448')
    await page.locator('.language-selector-trigger').waitFor()
    await page.waitForFunction(() => Boolean(window.kakao?.maps?.Map) && document.querySelectorAll('.map img').length > 0)
    await page.locator('.place-card .card-label').filter({ hasText: 'Open toilet' }).waitFor()
    const mapNode = await page.locator('.map').elementHandle()
    const title = await page.locator('.place-card h1').innerText()
    assert.ok(title.length > 0)
    await page.locator('.language-selector-trigger').click()
    await page.getByRole('menuitemradio', { name: '한국어', exact: true }).click()
    await page.waitForURL('**/toilet/13448')
    await page.waitForFunction(() => document.documentElement.lang === 'ko')
    assert.ok(await mapNode.evaluate(node => node === document.querySelector('.map')))
    await page.locator('.language-selector-trigger').click()
    await page.getByRole('menuitemradio', { name: 'English', exact: true }).click()
    await page.waitForFunction(() => document.documentElement.lang === 'en')
    assert.equal(await page.locator('.place-card h1').innerText(), title)
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: width < 500 ? 844 : 850 })
      await page.locator('.language-selector-trigger').click()
      const menu = await page.getByRole('menu').boundingBox()
      assert.ok(menu.x >= 0 && menu.x + menu.width <= width + 1)
      await page.screenshot({ path: path.resolve(`.next/i18n-live-${width}.png`), animations: 'disabled' })
      await page.keyboard.press('Escape')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No horizontal overflow at ${width}`)
    }
    await page.locator('.review-entry').click()
    await page.getByRole('dialog', { name: 'Log in or sign up' }).waitFor()
    assert.equal(await page.locator('.login-modal p').first().innerText(), 'Log in to write a review.')
    await page.getByRole('button', { name: 'Close login', exact: true }).click()
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ passed: true, realKakaoMap: true, originalFacilityTitle: title, widths: [320, 390, 1280], blockedWriteRequests: [...new Set(writes)], loginSubmitted: false }))
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
