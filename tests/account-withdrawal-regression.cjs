const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const path = require('node:path')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const screenshotDirectory = mkdtempSync(path.join(tmpdir(), 'geupddong-withdrawal-test-'))
const assert = require('node:assert/strict')
const origin = 'http://127.0.0.1:4174'

;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const viewport of [{ width: 375, height: 667 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' })
      let authenticated = true, withdrawal, decision, recovery = false
      let optionsEnabled = true, optionsStatus = 200, recoveryStatus = 200, erasureStatus = 204
      let deferWithdrawal = false, releaseWithdrawal, withdrawalStarted
      const errors = []
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url()), method = req.method(), path = url.pathname
        const json = (value, status = 200) => route.fulfill({ status, json: value })
        if (path.startsWith('/api/v1/')) {
          if (path === '/api/v1/auth/me' && method === 'DELETE') {
            withdrawal = req.postDataJSON()
            if (deferWithdrawal) await new Promise(resolve => { releaseWithdrawal = resolve; withdrawalStarted() })
            authenticated = false
            return withdrawal.retainForRecovery ? json({ purgeAfter: '2026-12-06T18:00:00+09:00' }) : route.fulfill({ status: erasureStatus })
          }
          if (path === '/api/v1/auth/me') return authenticated ? json({ userId: '7', displayName: '검증용 사용자', email: null, roles: ['USER'], status: 'ACTIVE', consentRequired: false }) : json({}, 401)
          if (path === '/api/v1/auth/withdrawal-options') return json({ enabled: optionsEnabled, consentVersion: 'recovery-2026-09-v1', purgeAfter: '2026-12-06T18:00:00+09:00' }, optionsStatus)
          if (path === '/api/v1/auth/consents/status') return json({ agreedPolicies: [], missingPolicies: [], consentRequired: false })
          if (path === '/api/v1/auth/refresh') return json({}, 401)
          if (path.includes('unread')) return json({ count: 0 })
          if (path === '/api/v1/auth/recovery' && method === 'GET') return recovery ? json({ displayName: '이전 닉네임', purgeAfter: '2026-12-06T18:00:00+09:00' }, recoveryStatus) : json({}, 401)
          if (path === '/api/v1/auth/recovery' && method === 'POST') { decision = req.postDataJSON(); authenticated = decision.action === 'RESTORE'; recovery = false; return route.fulfill({ status: decision.action === 'ERASE' ? erasureStatus : 204 }) }
          if (path === '/api/v1/auth/recovery' && method === 'DELETE') { decision = 'CANCEL'; return route.fulfill({ status: 204 }) }
          return json([])
        }
        // No production API writes, third-party SDK calls, OAuth logins, or geocoding in this UI test.
        if (url.origin !== origin) return route.abort()
        return route.continue()
      })
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      page.on('pageerror', e => errors.push(e.message))
      await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style')
        style.textContent = 'nextjs-portal { pointer-events: none !important; }'
        document.head.append(style)
      }))
      const openAccount = async () => {
        await page.goto(origin)
        if (viewport.width < 768) {
          await page.getByRole('button', { name: '내 페이지', exact: true }).click()
          await page.getByRole('button', { name: /계정 관리 · 동의 내역/ }).click()
        } else {
          await page.getByRole('button', { name: '전체 메뉴', exact: true }).click()
          await page.getByRole('navigation', { name: '전체 메뉴', exact: true }).getByRole('button', { name: '내 계정', exact: true }).click()
        }
        await page.getByRole('button', { name: '회원 탈퇴', exact: true }).click()
      }
      await openAccount()
      const choice = page.getByRole('checkbox', { name: /3개월간 계정 복구/ })
      assert.equal(await choice.isChecked(), false)
      assert.equal(await page.locator('.account-erasure-notice').getAttribute('open'), null)
      await page.getByText('삭제 범위·백업 안내', { exact: true }).click()
      assert.ok(await page.getByText('회원정보 파기 완료 안내는 서비스 DB', { exact: false }).isVisible())
      assert.ok(await page.getByRole('link', { name: '보관·파기 안내 보기' }).isVisible())
      assert.equal(await choice.isChecked(), false, 'Reading the notice must not opt into recovery consent')
      await page.getByText('삭제 범위·백업 안내', { exact: true }).click()
      await page.getByRole('button', { name: '정보 파기 요청하고 탈퇴', exact: true }).waitFor()
      await choice.check()
      const withdrawalBox = await page.locator('.account-dialog').boundingBox()
      assert.ok(withdrawalBox.width <= viewport.width && withdrawalBox.y >= 0 && withdrawalBox.y + withdrawalBox.height <= viewport.height + 1)
      await page.getByRole('button', { name: '취소', exact: true }).click()
      await page.getByRole('button', { name: '회원 탈퇴', exact: true }).click()
      assert.equal(await choice.isChecked(), false, 'Optional consent must reset after cancelling')
      await choice.check()
      await page.screenshot({ path: path.join(screenshotDirectory, `withdrawal-choice-${viewport.width}.png`) })
      await page.getByRole('button', { name: '복구 정보 보관하고 탈퇴', exact: true }).scrollIntoViewIfNeeded()
      const submitBox = await page.getByRole('button', { name: '복구 정보 보관하고 탈퇴', exact: true }).boundingBox()
      assert.ok(submitBox.y >= 0 && submitBox.y + submitBox.height <= viewport.height + 1)
      await page.screenshot({ path: path.join(screenshotDirectory, `withdrawal-choice-actions-${viewport.width}.png`) })
      await page.getByRole('button', { name: '복구 정보 보관하고 탈퇴', exact: true }).click()
      await page.getByRole('dialog', { name: '탈퇴 처리 안내' }).waitFor()
      assert.ok(await page.getByText('기한이 지나면 복구할 수 없고 정기 작업에서 파기합니다.', { exact: false }).isVisible())
      assert.deepEqual(withdrawal, { retainForRecovery: true, consentVersion: 'recovery-2026-09-v1' })
      await page.getByRole('button', { name: '확인', exact: true }).click()
      recovery = true
      await page.goto(origin + '/?recovery=required')
      await page.getByRole('button', { name: '이전 계정 복구', exact: true }).waitFor()
      assert.equal(decision, undefined, 'OAuth must not automatically restore')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      const box = await page.locator('.account-dialog').boundingBox()
      assert.ok(box.width <= viewport.width && box.y >= 0 && box.y + box.height <= viewport.height + 1)
      await page.screenshot({ path: path.join(screenshotDirectory, `withdrawal-recovery-${viewport.width}.png`) })
      await page.getByRole('button', { name: '이전 계정 복구', exact: true }).click()
      await page.waitForURL('**/?login=success&consent=required')
      assert.deepEqual(decision, { action: 'RESTORE' })
      authenticated = false; recovery = true; decision = undefined
      await page.goto(origin + '/?recovery=required')
      await page.getByRole('button', { name: '복구 없이 삭제 요청', exact: true }).click()
      assert.equal(decision, undefined, 'Destructive confirmation is required')
      await page.getByRole('button', { name: '삭제 요청 취소', exact: true }).click()
      assert.equal(decision, undefined, 'Cancelling confirmation must not send a deletion request')
      await page.getByRole('button', { name: '복구 없이 삭제 요청', exact: true }).click()
      await page.getByRole('button', { name: '확인했어요, 삭제 요청', exact: true }).click()
      await page.getByRole('status').filter({ hasText: '회원정보를 파기했어요' }).waitFor()
      assert.deepEqual(decision, { action: 'ERASE' })

      // A completed non-retained request describes DB scope, not simultaneous backup erasure.
      authenticated = true; withdrawal = undefined
      await openAccount()
      await page.getByRole('button', { name: '정보 파기 요청하고 탈퇴', exact: true }).click()
      await page.getByText('탈퇴 및 서비스 DB의 회원정보 파기가 완료됐어요.', { exact: false }).waitFor()
      assert.ok(await page.getByText('백업·재생 방지 기록은 별도 보관·파기 절차로 관리합니다.', { exact: false }).isVisible())
      assert.deepEqual(withdrawal, { retainForRecovery: false })
      await page.getByRole('button', { name: '확인', exact: true }).click()

      // Disabled options and failed status requests cannot enable a destructive action.
      authenticated = true; optionsEnabled = false; withdrawal = undefined
      await openAccount()
      await page.getByRole('status').filter({ hasText: '탈퇴 기능 점검 중' }).waitFor()
      assert.equal(await page.getByRole('button', { name: '정보 파기 요청하고 탈퇴', exact: true }).isDisabled(), true)
      assert.equal(await choice.isDisabled(), true)
      assert.equal(withdrawal, undefined)
      optionsStatus = 503
      await openAccount()
      await page.getByRole('alert').filter({ hasText: '탈퇴·복구 기능 점검 중' }).waitFor()
      assert.equal(await page.getByRole('button', { name: '정보 파기 요청하고 탈퇴', exact: true }).isDisabled(), true)

      // A pending response never claims completed erasure; in-flight requests cannot be dismissed.
      optionsEnabled = true; optionsStatus = 200; erasureStatus = 202; deferWithdrawal = true
      await openAccount()
      const started = new Promise(resolve => { withdrawalStarted = resolve })
      await page.getByRole('button', { name: '정보 파기 요청하고 탈퇴', exact: true }).click()
      await started
      assert.equal(await page.getByRole('button', { name: '계정 창 닫기', exact: true }).isDisabled(), true)
      assert.equal(await page.getByRole('button', { name: '취소', exact: true }).isDisabled(), true)
      await page.locator('.account-backdrop').click({ position: { x: 1, y: 1 } })
      assert.equal(await page.locator('.account-dialog').count(), 1)
      releaseWithdrawal(); deferWithdrawal = false
      await page.getByText('탈퇴가 완료됐어요. 정보 파기는 아직 처리 대기 중입니다.', { exact: true }).waitFor()
      assert.deepEqual(withdrawal, { retainForRecovery: false })
      await page.screenshot({ path: path.join(screenshotDirectory, `withdrawal-pending-${viewport.width}.png`) })
      await page.getByRole('button', { name: '확인', exact: true }).click()

      recovery = true; decision = undefined
      await page.goto(origin + '/?recovery=required')
      await page.getByRole('button', { name: '복구 없이 삭제 요청', exact: true }).click()
      await page.getByRole('button', { name: '확인했어요, 삭제 요청', exact: true }).click()
      await page.getByRole('status').filter({ hasText: '정보 파기는 아직 처리 대기 중' }).waitFor()
      for (const status of [503, 401]) {
        recovery = true; recoveryStatus = status; decision = undefined
        await page.goto(origin + '/?recovery=required')
        await page.getByRole('alert').filter({ hasText: status === 503 ? '점검 중' : '인증 시간이 만료' }).waitFor()
        assert.equal(await page.getByText('같은 소셜 계정이 확인됐어요.', { exact: false }).count(), 0)
        assert.equal(await page.getByRole('button', { name: '이전 계정 복구', exact: true }).count(), 0)
        await page.getByRole('button', { name: '지금은 복구하지 않기', exact: true }).click()
        await page.waitForURL(origin + '/')
        assert.equal(decision, 'CANCEL')
      }
      await page.goto(origin + '/policies/privacy')
      await page.getByText('검토용 개정안 · 시행일 미정', { exact: true }).waitFor()
      assert.equal(await page.getByText('시행일·최종 수정일: 2026년 9월 6일').count(), 0)
      await page.locator('#erasure-records').scrollIntoViewIfNeeded()
      assert.ok(await page.getByText('급똥 운영자가 관리하는 국내 서버의 별도 파일 영역.', { exact: false }).isVisible())
      assert.equal(await page.getByText('미국 제한 버킷.', { exact: false }).count(), 0)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      await page.screenshot({ path: path.join(screenshotDirectory, `withdrawal-policy-${viewport.width}.png`) })
      assert.deepEqual(errors, [])
      console.log(JSON.stringify({ viewport, optionalConsent: true, consentReset: true, explicitRecovery: true, eraseConfirmation: true, maintenance: true, expiredProof: true, pendingErasure: true, inFlightCloseBlocked: true, cancellation: true, realBusinessWrites: 0 }))
      await context.close()
    }
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
