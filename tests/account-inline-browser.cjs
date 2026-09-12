// All member/consent/withdrawal requests are synthetic browser fixtures.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright')
const origin = process.env.REVIEW_PREVIEW_ORIGIN || 'http://127.0.0.1:4187'
assert.ok(['http://127.0.0.1:4187', 'https://preview.geupddong.com'].includes(origin))
const output = process.env.REVIEW_SCREENSHOT_DIR || path.resolve('.tmp-account-inline-screenshots')
fs.mkdirSync(output, { recursive: true })
const policies = [
  { id: 1, key: 'SERVICE_TERMS', title: '서비스 이용약관', contentPath: '/policy-history/2026-09-01.html#terms' },
  { id: 2, key: 'PRIVACY_COLLECTION', title: '개인정보 수집·이용', contentPath: '/policies/privacy#collection' },
  { id: 3, key: 'AGE_14_PLUS', title: '만 14세 이상', contentPath: '/policies/terms' },
].map(p => ({ ...p, version: 'fixture-v1', required: true, effectiveAt: '2026-09-01', agreedAt: '2026-09-11T12:00:00+09:00' }))
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const width of [390, 320, 1280]) {
      const mobile = width < 600
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' })
      let consentRequired = false, policyFailure = false, consentPayload, withdrawalPayload, releaseWithdrawal, signedIn = true, unexpectedWrites = 0
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url()), method = request.method()
        const json = (value, status = 200) => route.fulfill({ json: value, status })
        if (url.pathname.startsWith('/api/v1/')) {
          if (url.pathname === '/api/v1/auth/me' && method === 'DELETE') {
            withdrawalPayload = request.postDataJSON()
            await new Promise(resolve => { releaseWithdrawal = resolve })
            signedIn = false
            return json({ erasurePending: true }, 202)
          }
          if (url.pathname === '/api/v1/auth/me') return json(signedIn ? { userId: 'inline-fixture', displayName: '화면 검증 사용자', email: 'fixture@example.invalid', roles: ['USER'], status: consentRequired ? 'PENDING_CONSENT' : 'ACTIVE', consentRequired } : {}, signedIn ? 200 : 401)
          if (url.pathname === '/api/v1/auth/consents/status') return json({ consentRequired, agreedPolicies: policies, missingPolicies: consentRequired ? policies : [] })
          if (url.pathname === '/api/v1/policies') return json(policies)
          if (url.pathname === '/api/v1/auth/consents' && method === 'POST') { consentPayload = request.postDataJSON(); consentRequired = false; return route.fulfill({ status: 204 }) }
          if (url.pathname === '/api/v1/auth/withdrawal-options') return json({ enabled: true, consentVersion: 'fixture-consent', purgeAfter: '2026-12-13T12:00:00+09:00' })
          if (url.pathname.includes('unread')) return json({ count: 0 })
          if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) unexpectedWrites++
          return json([])
        }
        if (url.pathname === '/cdn-cgi/rum') return route.fulfill({ status: 204 })
        if (url.pathname.startsWith('/policy-history/') && policyFailure) return route.fulfill({ status: 503, body: 'unavailable' })
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) { unexpectedWrites++; return route.abort() }
        if (url.origin !== origin) return route.abort()
        return route.continue()
      })
      await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style'); style.textContent = 'nextjs-portal {display:none!important}'; document.head.append(style)
      }))
      const page = await context.newPage(), errors = []
      page.on('pageerror', e => errors.push(e.message))
      await page.goto(origin, { waitUntil: 'networkidle' })
      const nav = page.getByRole('navigation', { name: '하단 내비게이션' }), shell = page.locator('.mobile-page')
      let homeTitle
      const openAccount = async () => {
        if (mobile) {
          await nav.getByRole('button', { name: '내 페이지', exact: true }).click()
          homeTitle = await shell.getByRole('heading', { name: '내 페이지', exact: true }).boundingBox()
          await shell.getByRole('button', { name: /계정 관리 · 동의 내역/ }).click()
          const title = await shell.getByRole('heading', { name: '계정 관리', exact: true }).boundingBox()
          assert.ok(Math.abs(title.y - homeTitle.y) < 1 && title.x === homeTitle.x)
          assert.equal(await page.getByRole('dialog').count(), 0, 'account settings are inline, not a popup')
        } else {
          await page.getByRole('button', { name: '전체 메뉴', exact: true }).click()
          await page.getByRole('navigation', { name: '전체 메뉴', exact: true }).getByRole('button', { name: '내 계정', exact: true }).click()
          await page.getByRole('dialog', { name: '내 계정', exact: true }).waitFor()
        }
      }
      await openAccount()
      const titleToggle = page.locator('.policy-disclosure-toggle').filter({ hasText: '서비스 이용약관' })
      await titleToggle.waitFor()
      assert.equal(await titleToggle.getAttribute('aria-expanded'), 'false')
      policyFailure = true
      await titleToggle.click()
      await page.getByRole('alert').filter({ hasText: '약관을 불러오지 못했어요' }).waitFor()
      policyFailure = false
      await page.getByRole('button', { name: '다시 불러오기', exact: true }).click()
      await page.getByRole('region', { name: '서비스 이용약관 내용' }).getByText('6. 이용 제한과 탈퇴', { exact: true }).waitFor()
      const body = page.getByRole('region', { name: '서비스 이용약관 내용' })
      assert.match(await body.innerText(), /소셜 연결 정보와 로그인 세션이 폐기됩니다/, 'exact archived document is rendered, not substituted current terms')
      assert.doesNotMatch(await body.innerText(), /리뷰/)
      assert.equal(await body.locator('script, iframe, style, form').count(), 0)
      assert.equal(await body.evaluate(el => getComputedStyle(el).fontSize), '12px')
      assert.equal(context.pages().length, 1)
      assert.equal(page.url(), origin + '/')
      if (mobile) {
        await shell.evaluate(el => { el.scrollTop = 180 })
        assert.ok(Math.abs((await shell.locator('.history-heading').boundingBox()).y - (await shell.boundingBox()).y) < 1)
        assert.ok((await shell.boundingBox()).y + (await shell.boundingBox()).height <= (await nav.boundingBox()).y + 1)
        await shell.evaluate(el => { el.scrollTop = 0 })
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.screenshot({ path: path.join(output, `account-inline-open-${width}.png`) })
      await titleToggle.click(); assert.equal(await body.count(), 0)
      await titleToggle.focus(); await page.keyboard.press('Enter'); await body.waitFor(); await page.keyboard.press('Space'); assert.equal(await body.count(), 0)
      await page.screenshot({ path: path.join(output, `account-inline-${width}.png`) })
      if (mobile) {
        await page.getByRole('button', { name: '계정 관리 닫기' }).click()
        for (const title of ['내 리뷰', '내 제보']) {
          await shell.getByRole('button', { name: title, exact: true }).click()
          const box = await shell.getByRole('heading', { name: title, exact: true }).boundingBox()
          assert.ok(Math.abs(box.y - homeTitle.y) < 1 && box.x === homeTitle.x, `${title} title matches account home`)
          await shell.getByRole('button', { name: `${title} 닫기` }).click()
        }
        await openAccount()
      }
      // Optional withdrawal consent remains unchecked and no deletion happens on opening/cancelling.
      await page.getByRole('button', { name: '회원 탈퇴', exact: true }).click()
      const recovery = page.getByRole('checkbox', { name: /3개월간 계정 복구/ })
      await page.waitForFunction(() => !document.querySelector('.withdrawal-choice input').disabled)
      assert.equal(await recovery.isChecked(), false)
      await recovery.check(); await page.getByRole('button', { name: '취소', exact: true }).click()
      assert.equal(withdrawalPayload, undefined)
      await page.getByRole('button', { name: '회원 탈퇴', exact: true }).click()
      await page.waitForFunction(() => !document.querySelector('.withdrawal-choice input').disabled)
      assert.equal(await recovery.isChecked(), false)
      await page.getByRole('button', { name: '정보 파기 요청하고 탈퇴', exact: true }).click()
      await page.waitForFunction(() => document.querySelector('.account-confirm button').disabled)
      assert.equal(await page.getByRole('button', { name: mobile ? '계정 관리 닫기' : '계정 창 닫기', exact: true }).isDisabled(), true)
      assert.deepEqual(withdrawalPayload, { retainForRecovery: false })
      releaseWithdrawal()
      await page.getByRole('dialog', { name: '탈퇴 처리 안내' }).waitFor()
      // New signup expands each original policy without toggling any consent.
      signedIn = true; consentRequired = true
      await page.goto(origin, { waitUntil: 'networkidle' })
      await page.getByRole('dialog', { name: '급똥 가입을 위한 동의가 필요해요' }).waitFor()
      for (let i = 0; i < policies.length; i++) {
        const toggle = page.locator('.consent-list .policy-disclosure-toggle').nth(i)
        await toggle.click()
        const region = page.locator('.consent-list .policy-disclosure-content')
        await region.locator('h3').first().waitFor()
        assert.equal(await page.locator('.consent-list input:checked').count(), 0)
        assert.equal(await page.getByRole('button', { name: '동의하고 시작하기' }).isDisabled(), true)
        if (i === 0) await page.screenshot({ path: path.join(output, `signup-policy-open-${width}.png`) })
        await toggle.click()
      }
      await page.getByRole('checkbox', { name: '필수 항목 모두 동의' }).check()
      assert.equal(await page.locator('.consent-list input:checked').count(), 3)
      await page.getByRole('button', { name: '동의하고 시작하기' }).click()
      await page.waitForFunction(() => !document.querySelector('.consent-modal'))
      assert.deepEqual(consentPayload, { policyKeys: policies.map(p => p.key) })
      assert.equal(unexpectedWrites, 0); assert.deepEqual(errors, [])
      console.log(`PASS account/consent ${width}: title alignment, inline account, exact archived terms, retry, small text, keyboard, signup consent independent, withdrawal guard; no real business writes`)
      await context.close()
    }
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
