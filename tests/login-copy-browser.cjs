// Signed-out fixture only: never perform OAuth, registration or a business write.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright')
const origin = process.env.REVIEW_PREVIEW_ORIGIN || 'http://127.0.0.1:4187'
assert.ok(['http://127.0.0.1:4187', 'https://preview.geupddong.com'].includes(origin))
const output = process.env.REVIEW_SCREENSHOT_DIR || path.resolve('.tmp-login-copy-screenshots')
fs.mkdirSync(output, { recursive: true })
async function assertProviderOrder(surface) {
 const buttons = surface.locator('button.social-login')
 assert.deepEqual(await buttons.allTextContents(), ['Google로 계속하기', 'Kakao로 계속하기'])
 const google = await buttons.nth(0).boundingBox(), kakao = await buttons.nth(1).boundingBox()
 assert.ok(google && kakao && google.y + google.height <= kakao.y, 'Google must appear above Kakao')
}
;(async () => {
 const browser = await chromium.launch({ channel: 'chrome', headless: true })
 try {
  for (const width of [320, 390, 1280]) {
   const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: 'block' })
   let writes = 0
   await context.route('**/*', route => {
    const req = route.request(), url = new URL(req.url())
    if (url.pathname === '/cdn-cgi/rum') return route.fulfill({ status: 204 })
    if (!['GET','HEAD','OPTIONS'].includes(req.method())) { writes++; return route.abort() }
    if (url.pathname === '/api/v1/auth/me') return route.fulfill({ json: null })
    if (url.pathname.includes('unread')) return route.fulfill({ json: { count: 0 } })
    if (url.pathname === '/api/v1/toilets') return route.fulfill({ json: { meta: { map_level: 4, display_type: 'MARKER', total_count: 0, result_count: 0 }, toilets: [], clusters: [] } })
    if (url.hostname === 'dapi.kakao.com') return route.abort()
    return route.continue()
   })
   await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style'); style.textContent = 'nextjs-portal {display:none!important}'; document.head.append(style)
   }))
   const page = await context.newPage(), errors = []
   page.on('pageerror', error => errors.push(error.message))
   await page.goto(origin + '/#review-test=36.3663520,127.3149258', { waitUntil: 'networkidle' })
   await page.locator('.place-card .review-entry').click()
   const dialog = page.getByRole('dialog', { name: '로그인 · 간편가입', exact: true })
   await dialog.waitFor()
   await assertProviderOrder(dialog)
   assert.equal(await dialog.locator(':scope > p').first().innerText(), '리뷰는 로그인 후 이용할 수 있어요.')
   assert.equal(await dialog.getByRole('button', { name: 'Google로 계속하기' }).isEnabled(), true)
   assert.equal(await dialog.getByRole('button', { name: 'Kakao로 계속하기' }).isEnabled(), true)
   assert.match(await dialog.locator('.login-policy-note').innerText(), /첫 가입 시 만 14세 이상 확인·필수 약관 동의/)
   assert.equal(await dialog.locator('.login-policy-links a').count(), 2)
   assert.equal(await dialog.evaluate(el => el.scrollWidth > el.clientWidth), false)
   await page.screenshot({ path: path.join(output, `review-login-${width}.png`) })
   await dialog.getByRole('button', { name: '로그인 창 닫기' }).click()
   if (width < 600) {
    for (const tab of ['알림', '내 페이지']) {
     await page.getByRole('navigation', { name: '하단 내비게이션' }).getByRole('button', { name: tab, exact: true }).click()
     await page.locator('.mobile-login-landing').getByRole('heading', { name: '로그인 · 간편가입', exact: true }).waitFor()
     await assertProviderOrder(page.locator('.mobile-login-landing'))
     assert.equal(await page.locator('.mobile-login-landing > p').first().innerText(), '구글·카카오로 간편하게 로그인하세요.')
     assert.equal(await page.getByRole('dialog').count(), 0)
     assert.equal(await page.locator('.mobile-login-landing').evaluate(el => el.scrollWidth > el.clientWidth), false)
     if (tab === '알림') await page.screenshot({ path: path.join(output, `notification-login-${width}.png`) })
    }
   } else {
    await page.getByRole('button', { name: '로그인 / 회원가입', exact: true }).click()
    assert.equal(await dialog.locator(':scope > p').first().innerText(), '구글·카카오로 간편하게 로그인하세요.')
    await assertProviderOrder(dialog)
   }
   assert.equal(writes, 0); assert.deepEqual(errors, [])
   console.log(`PASS login copy ${width}: short descriptions, shared title, Google above Kakao on all entry surfaces, policy links preserved; no business writes`)
   await context.close()
  }
 } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
