const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH)
const assert = require('node:assert/strict')
const origin = 'http://127.0.0.1:4174'

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const viewport of [{ width: 375, height: 667 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' })
      let authenticated = true, withdrawal, decision, recovery = false
      const errors = []
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url()), method = req.method(), path = url.pathname
        const json = (value, status = 200) => route.fulfill({ status, json: value })
        if (path.startsWith('/api/v1/')) {
          if (path === '/api/v1/auth/me' && method === 'DELETE') { withdrawal = req.postDataJSON(); authenticated = false; return withdrawal.retainForRecovery ? json({ purgeAfter: '2026-12-06T18:00:00+09:00' }) : route.fulfill({ status: 204 }) }
          if (path === '/api/v1/auth/me') return authenticated ? json({ userId: '7', displayName: '검증용 사용자', email: null, roles: ['USER'], status: 'ACTIVE', consentRequired: false }) : json({}, 401)
          if (path === '/api/v1/auth/withdrawal-options') return json({ enabled: true, consentVersion: 'recovery-2026-09-v1', purgeAfter: '2026-12-06T18:00:00+09:00' })
          if (path === '/api/v1/auth/consents/status') return json({ agreedPolicies: [], missingPolicies: [], consentRequired: false })
          if (path === '/api/v1/auth/refresh') return json({}, 401)
          if (path.includes('unread')) return json({ count: 0 })
          if (path === '/api/v1/auth/recovery' && method === 'GET') return recovery ? json({ displayName: '이전 닉네임', purgeAfter: '2026-12-06T18:00:00+09:00' }) : json({}, 401)
          if (path === '/api/v1/auth/recovery' && method === 'POST') { decision = req.postDataJSON(); authenticated = decision.action === 'RESTORE'; recovery = false; return route.fulfill({ status: 204 }) }
          if (path === '/api/v1/auth/recovery' && method === 'DELETE') return route.fulfill({ status: 204 })
          return json([])
        }
        // No production API writes, third-party SDK calls, OAuth logins, or geocoding in this UI test.
        if (url.origin !== origin) return route.abort()
        return route.continue()
      })
      const page = await context.newPage()
      page.on('pageerror', e => errors.push(e.message))
      await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style')
        style.textContent = 'nextjs-portal { pointer-events: none !important; }'
        document.head.append(style)
      }))
      await page.goto(origin)
      if (viewport.width < 768) {
        await page.getByRole('button', { name: '내 페이지', exact: true }).click()
        await page.getByRole('button', { name: /계정 관리 · 동의 내역/ }).click()
      } else {
        await page.getByRole('button', { name: '전체 메뉴', exact: true }).click()
        await page.getByRole('navigation', { name: '전체 메뉴', exact: true }).getByRole('button', { name: '내 계정', exact: true }).click()
      }
      await page.getByRole('button', { name: '회원 탈퇴', exact: true }).click()
      const choice = page.getByRole('checkbox', { name: /3개월간 계정 복구/ })
      assert.equal(await choice.isChecked(), false)
      await page.getByRole('button', { name: '즉시 파기하고 탈퇴', exact: true }).waitFor()
      await choice.check()
      await page.screenshot({ path: `C:/fork/tiolet/.tmp/withdrawal-choice-${viewport.width}.png` })
      await page.getByRole('button', { name: '복구 정보 보관하고 탈퇴', exact: true }).click()
      await page.waitForFunction(() => !document.querySelector('.account-dialog'))
      assert.deepEqual(withdrawal, { retainForRecovery: true, consentVersion: 'recovery-2026-09-v1' })
      recovery = true
      await page.goto(origin + '/?recovery=required')
      await page.getByRole('button', { name: '이전 계정 복구', exact: true }).waitFor()
      assert.equal(decision, undefined, 'OAuth must not automatically restore')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      const box = await page.locator('.account-dialog').boundingBox()
      assert.ok(box.width <= viewport.width && box.y >= 0 && box.y + box.height <= viewport.height + 1)
      await page.screenshot({ path: `C:/fork/tiolet/.tmp/withdrawal-recovery-${viewport.width}.png` })
      await page.getByRole('button', { name: '이전 계정 복구', exact: true }).click()
      await page.waitForURL('**/?login=success&consent=required')
      assert.deepEqual(decision, { action: 'RESTORE' })
      authenticated = false; recovery = true; decision = undefined
      await page.goto(origin + '/?recovery=required')
      await page.getByRole('button', { name: '복구 없이 즉시 삭제', exact: true }).click()
      assert.equal(decision, undefined, 'Destructive confirmation is required')
      await page.getByRole('button', { name: '확인했어요, 완전히 삭제', exact: true }).click()
      await page.getByRole('status').filter({ hasText: '회원정보를 파기했어요' }).waitFor()
      assert.deepEqual(decision, { action: 'ERASE' })
      assert.deepEqual(errors, [])
      console.log(JSON.stringify({ viewport, optionalConsent: true, explicitRecovery: true, eraseConfirmation: true, realBusinessWrites: 0 }))
      await context.close()
    }
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
