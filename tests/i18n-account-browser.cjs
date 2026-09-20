// Called by i18n-browser.cjs against its loopback Next server. All account writes are intercepted fixtures.
const assert = require('node:assert/strict')
const path = require('node:path')
const policies = [
  { id: 1, key: 'SERVICE_TERMS', title: '급똥 서비스 이용약관', contentPath: '/policies/terms' },
  { id: 2, key: 'PRIVACY_COLLECTION', title: '개인정보 수집·이용 동의', contentPath: '/policies/privacy#collection' },
  { id: 3, key: 'AGE_14_PLUS', title: '만 14세 이상 확인', contentPath: '/policies/terms#age' },
].map(item => ({ ...item, required: true, version: '1.0', effectiveAt: '2026-09-01', agreedAt: '2026-09-18T15:30:00Z' }))
const photoVersion = '12345678-1234-1234-1234-123456789abc'
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5eQAAAAASUVORK5CYII=', 'base64')
module.exports = async function runAccountChecks(browser, origin) {
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/)
  for (const width of [320, 390, 1280]) {
    const mobile = width < 500
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'block' })
    let mode = 'active', nickname = '원문 닉네임', policyFailure = false
    let photo = { available: true, publicPhoto: false, imageVersion: photoVersion }
    const writes = [], unexpectedWrites = [], errors = []
    await context.route('**/*', route => {
      const req = route.request(), url = new URL(req.url()), method = req.method(), p = url.pathname
      const json = (data, status = 200) => route.fulfill({ json: data, status })
      const noContent = () => route.fulfill({ status: 204 })
      if (p.startsWith('/api/v1/')) {
        if (method === 'OPTIONS') return noContent()
        if (p === '/api/v1/analytics/events') return noContent()
        if (p === '/api/v1/auth/me' && method === 'GET') return mode === 'recovery' ? json({}, 401) : json({ userId: 'account-fixture', displayName: nickname, email: 'fixture@example.invalid', roles: ['USER'], status: mode === 'consent' ? 'PENDING_CONSENT' : 'ACTIVE', consentRequired: mode === 'consent', profilePhoto: photo })
        if (p === '/api/v1/auth/consents/status') return json({ consentRequired: false, missingPolicies: [], agreedPolicies: [...policies, { ...policies[0], version: 'old-fixture', contentPath: '/policy-history/2026-09-01.html#terms' }] })
        if (p === '/api/v1/policies') return json(policies)
        if (p === '/api/v1/auth/withdrawal-options') return json({ enabled: true, consentVersion: 'fixture-retention', purgeAfter: '2026-12-20T00:30:00+09:00' })
        if (p === '/api/v1/auth/me/photo/image' || p.startsWith('/api/v1/profile-photos/')) return route.fulfill({ contentType: 'image/png', body: image })
        if (p === '/api/v1/auth/recovery' && method === 'GET') return json({ displayName: nickname, purgeAfter: '2026-12-20T00:30:00' })
        if (p === '/api/v1/auth/me/photo') {
          if (method === 'PATCH') { writes.push({ kind: 'photo-visibility', body: req.postDataJSON() }); photo = { ...photo, ...req.postDataJSON() } }
          if (method === 'PUT') { writes.push({ kind: 'photo-upload', type: req.headers()['content-type'], bytes: req.postDataBuffer().length }); photo = { ...photo, publicPhoto: true, imageVersion: photoVersion } }
          if (method === 'DELETE') { writes.push({ kind: 'photo-delete' }); photo = { ...photo, publicPhoto: false, imageVersion: null } }
          return json(photo)
        }
        if (p === '/api/v1/auth/me/profile' && method === 'PATCH') { const body = req.postDataJSON(); writes.push({ kind: 'nickname', body }); nickname = body.displayName; return json({ displayName: nickname }) }
        if (p === '/api/v1/auth/consents' && method === 'POST') { writes.push({ kind: 'consent', body: req.postDataJSON() }); mode = 'active'; return noContent() }
        if (p === '/api/v1/auth/me' && method === 'DELETE') { const body = req.postDataJSON(); writes.push({ kind: 'withdraw', body }); return body.retainForRecovery ? json({ purgeAfter: '2026-12-20T00:30:00+09:00' }) : json({}, 202) }
        if (p === '/api/v1/auth/recovery' && method === 'POST') { const body = req.postDataJSON(); writes.push({ kind: 'recovery', body }); if (body.action === 'RESTORE') { mode = 'consent'; return noContent() } return json({}, 202) }
        if (p === '/api/v1/auth/recovery' && method === 'DELETE') { writes.push({ kind: 'cancel-recovery' }); mode = 'active'; return noContent() }
        if (p.includes('unread')) return json({ count: 0 })
        if (p.includes('/auth/refresh')) return json({}, 401)
        if (!['GET', 'HEAD'].includes(method)) unexpectedWrites.push({ p, method })
        return json([])
      }
      if (url.origin !== origin || !['GET', 'HEAD'].includes(method)) return route.abort()
      if (p === '/en/policies/terms' && policyFailure) return route.fulfill({ status: 503, body: 'synthetic failure' })
      return route.continue()
    })
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(e.message))
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    const openAccount = async () => {
      if (mobile) { await nav.getByRole('button', { name: 'My page', exact: true }).click(); await page.locator('.mobile-account-links').getByRole('button', { name: /Account/ }).click() }
      else await page.locator('.header-account-button').filter({ hasText: 'My account' }).click()
      await page.getByRole('heading', { name: mobile ? 'Account settings' : 'My account', exact: true }).waitFor()
    }
    try {
      await page.goto(origin + '/en'); await openAccount()
      const first = page.locator('.policy-disclosure-toggle').first()
      policyFailure = true; await first.click()
      await page.locator('.policy-disclosure-content [role="alert"]').waitFor()
      policyFailure = false; await page.locator('.policy-disclosure-content').getByRole('button', { name: 'Try again' }).click()
      await page.locator('.policy-disclosure-content h3').filter({ hasText: '1. Purpose' }).waitFor()
      assert.equal(await page.locator('.policy-disclosure-content .policy-translation-note').count(), 1)
      assert.equal((await page.locator('.policy-disclosure-content').innerText()).match(/does not change the agreement conditions/g)?.length, 1)
      assert.ok(await page.getByText('fixture@example.invalid', { exact: true }).isVisible())
      await first.click()
      await page.locator('.policy-disclosure-toggle').last().click()
      await page.locator('.policy-disclosure-content h3').filter({ hasText: '6. 이용 제한과 탈퇴' }).waitFor()
      assert.match(await page.locator('.policy-disclosure-toggle').last().innerText(), /Korean original/)
      assert.equal(await page.locator('.policy-disclosure-content script, .policy-disclosure-content iframe').count(), 0)
      await page.locator('.policy-disclosure-toggle').last().click()
      await page.getByRole('button', { name: 'Delete account', exact: true }).click()
      const retention = page.locator('.withdrawal-choice input')
      await page.waitForFunction(() => !document.querySelector('.withdrawal-choice input').disabled)
      assert.equal(await retention.isChecked(), false)
      await retention.check(); await page.getByRole('button', { name: 'Cancel', exact: true }).click()
      assert.equal(writes.length, 0, 'opening policies or cancelling deletion does not consent or mutate')
      await page.getByRole('button', { name: 'Delete account', exact: true }).click()
      await page.waitForFunction(() => !document.querySelector('.withdrawal-choice input').disabled)
      assert.equal(await retention.isChecked(), false)
      await page.screenshot({ path: path.resolve(`.next/i18n-account-${width}.png`) })
      await page.getByRole('button', { name: 'Delete and request erasure', exact: true }).click()
      await page.getByRole('dialog', { name: 'Account deletion result' }).getByText(/still pending/).waitFor()
      assert.deepEqual(writes.at(-1), { kind: 'withdraw', body: { retainForRecovery: false } })
      await page.goto(origin + '/en'); await openAccount()
      await page.getByRole('button', { name: 'Delete account', exact: true }).click()
      await page.waitForFunction(() => !document.querySelector('.withdrawal-choice input').disabled)
      await retention.check(); await page.getByRole('button', { name: 'Delete and retain recovery data', exact: true }).click()
      await page.getByRole('dialog', { name: 'Account deletion result' }).getByText(/20\/12\/2026/).waitFor()
      assert.deepEqual(writes.at(-1).body, { retainForRecovery: true, consentVersion: 'fixture-retention' })
      mode = 'consent'; await page.goto(origin + '/en')
      await page.getByRole('dialog', { name: 'Review the terms to join Geupddong' }).waitFor()
      for (let i = 0; i < policies.length; i++) {
        const toggle = page.locator('.consent-list .policy-disclosure-toggle').nth(i)
        await toggle.click()
        const content = page.locator('.consent-list .policy-disclosure-content')
        await content.locator('h3').first().waitFor()
        assert.equal(await page.locator('.consent-list input:checked').count(), 0)
        assert.equal(await page.getByRole('button', { name: 'Agree and continue' }).isDisabled(), true)
        if (i === 2) { assert.match(await content.innerText(), /at least 14/); assert.doesNotMatch(await content.innerText(), /7. Changes/); await page.screenshot({ path: path.resolve(`.next/i18n-consent-${width}.png`) }) }
        await toggle.click()
      }
      await page.getByRole('checkbox', { name: 'Agree to all required items' }).check()
      await page.getByRole('button', { name: 'Agree and continue' }).click()
      await page.waitForFunction(() => !document.querySelector('.consent-modal'))
      assert.deepEqual(writes.find(x => x.kind === 'consent').body, { policyKeys: policies.map(p => p.key) })
      mode = 'recovery'; await page.goto(origin + '/en?recovery=required')
      await page.getByRole('button', { name: 'Recover account', exact: true }).waitFor()
      assert.match(await page.locator('.account-recovery').innerText(), /20\/12\/2026/)
      await page.getByRole('button', { name: 'Request erasure without recovery', exact: true }).click()
      assert.equal(writes.filter(x => x.kind === 'recovery').length, 0)
      await page.getByRole('button', { name: 'Cancel erasure request', exact: true }).click()
      await page.getByRole('button', { name: 'Request erasure without recovery', exact: true }).click()
      await page.getByRole('button', { name: 'Confirm erasure request', exact: true }).click()
      await page.locator('.account-recovery').getByText(/erasure is still pending/).waitFor()
      assert.equal(await page.getByRole('link', { name: 'Back to map', exact: true }).getAttribute('href'), '/en')
      await page.goto(origin + '/en?recovery=required')
      await page.getByRole('button', { name: 'Recover account', exact: true }).click()
      await page.waitForURL(url => url.pathname === '/en' && url.searchParams.get('login') === 'success')
      await page.getByRole('dialog', { name: 'Review the terms to join Geupddong' }).waitFor()
      mode = 'active'; await page.goto(origin + '/en')
      if (mobile) {
        await nav.getByRole('button', { name: 'My page', exact: true }).click()
        await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
        await page.locator('#mobile-nickname').fill('새 닉네임 원문')
        await page.getByRole('button', { name: 'Save', exact: true }).click()
        await page.getByRole('heading', { name: '새 닉네임 원문', exact: true }).waitFor()
        await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
        await page.getByRole('switch', { name: 'Show profile photo on reviews' }).click()
        await page.waitForFunction(() => document.querySelector('.profile-photo-switch')?.getAttribute('aria-checked') === 'true')
        await page.getByRole('button', { name: 'Change profile photo' }).click()
        await page.getByRole('dialog', { name: 'Profile photo options' }).waitFor()
        await page.locator('#profile-photo-file').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: image })
        await page.getByRole('dialog', { name: 'Edit profile photo' }).waitFor()
        await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
        await page.screenshot({ path: path.resolve(`.next/i18n-photo-${width}.png`) })
        await page.getByRole('button', { name: 'Apply', exact: true }).click()
        await page.getByText('Profile photo saved.', { exact: true }).waitFor()
        const upload = writes.find(x => x.kind === 'photo-upload')
        assert.ok(upload.bytes > 0); assert.match(upload.type, /^image\/(webp|jpeg|png)$/)
        await page.getByRole('button', { name: 'Change profile photo' }).click()
        await page.getByRole('button', { name: 'Delete profile photo', exact: true }).click()
        await page.getByText('Profile photo deleted.', { exact: true }).waitFor()
      }
      for (const kind of ['terms', 'privacy', 'location', 'all']) {
        await page.goto(origin + '/en/policies/' + kind)
        await page.locator('.policy-document h1').waitFor()
        assert.equal(await page.locator('html').getAttribute('lang'), 'en')
        assert.equal(await page.getByRole('link', { name: 'Back to map', exact: true }).getAttribute('href'), '/en')
        assert.equal(await page.locator('.policy-translation-note a').getAttribute('href'), '/policies/' + kind)
        assert.equal(await page.locator('.policy-footer').getByRole('link', { name: 'Terms', exact: true }).getAttribute('href'), '/en/policies/terms')
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        if (kind === 'privacy' || kind === 'all') {
          const text = await page.locator('.policy-document').innerText()
          assert.match(text, /Service usage statistics: page types/)
          assert.match(text, /does not stop statistics collection/)
          assert.doesNotMatch(text, /Optional analytics|if analytics is allowed/)
        }
        if (kind === 'all') await page.screenshot({ path: path.resolve(`.next/i18n-policy-${width}.png`) })
      }
      await page.goto(origin + '/policies/privacy')
      const original = await page.locator('.policy-document').innerText()
      assert.match(original, /서비스 이용 통계: 페이지 유형/)
      assert.match(original, /통계 수집 자체를 중지하는 기능은 아닙니다/)
      assert.doesNotMatch(original, /선택 분석|분석 사용을 허용한 경우/)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      assert.deepEqual(unexpectedWrites, []); assert.deepEqual(errors, [])
      console.log(`PASS ${width}px: English policies, exact archives, independent consent, deletion pending/retention, recovery, profile/photo fixture writes`)
    } finally { await context.close() }
  }
}
