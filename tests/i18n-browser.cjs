// Entirely local: synthetic facility/API/map SDK, no production calls or credentials.
const assert = require('node:assert/strict')
const http = require('node:http')
const { spawn, execFileSync } = require('node:child_process')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH)
const origin = 'http://127.0.0.1:3185'
const facility = { id: 123, name: '합성 검증 화장실', toiletType: '공중화장실', latitude: 36.35, longitude: 127.38,
  roadAddress: '합성 주소', jibunAddress: '', region: null, openTime: '24시간', openTimeDetail: '',
  maleToiletCount: 2, maleUrinalCount: 1, maleDisabledToiletCount: 0, maleDisabledUrinalCount: 0, maleChildToiletCount: 0, maleChildUrinalCount: 0,
  femaleToiletCount: 2, femaleDisabledToiletCount: 0, femaleChildToiletCount: 0,
  hasEmergencyBell: 'Y', hasCctv: 'N', hasDiaperTable: 'N' }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
let server, next, browser, logs = ''
const reportWrites = []
async function main() {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    res.setHeader('content-type', 'application/json')
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('access-control-allow-credentials', 'true')
    res.setHeader('access-control-allow-headers', 'content-type')
    const send = (body, status = 200) => { res.statusCode = status; res.end(JSON.stringify(body)) }
    if (req.method === 'OPTIONS') return send({})
    if (req.method === 'POST' && url.pathname === '/api/v1/reports' && req.headers.cookie?.includes('fixture-login=1')) {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', () => { reportWrites.push(JSON.parse(body)); send({}) })
      return
    }
    if (req.method !== 'GET') return send({}, 405)
    if (url.pathname === '/api/v1/toilets/123') return send(facility)
    if (url.pathname.startsWith('/api/v1/toilets/') && /\/\d+$/.test(url.pathname)) return send({}, 404)
    if (url.pathname === '/api/v1/auth/me' && req.headers.cookie?.includes('fixture-login=1')) return send({ userId: 'synthetic-owner', displayName: '합성 닉네임', email: null, status: 'ACTIVE', roles: [], consentRequired: false })
    if (url.pathname.includes('auth')) return send({}, 401)
    if (url.pathname === '/api/v1/reports/me') return send([{ id: 9, toiletId: 123, toiletName: facility.name, reportType: 'OPEN_TIME_CORRECTION', openTime: '오전 9시', reason: '작성자가 남긴 제보 원문', status: 'APPROVED', reviewNote: '관리자 답변 원문', createdAt: new Date().toISOString() }])
    if (url.pathname === '/api/v1/notifications/unread-count') return send({ count: 1 })
    if (url.pathname === '/api/v1/notifications') return send({ items: [{ id: 1, type: 'REPORT_APPROVED', referenceType: 'TOILET_REPORT', referenceId: 9, title: '제보 승인', message: '합성 알림 원문', read: false, createdAt: new Date().toISOString() }], page: 0, size: 20, totalElements: 1, totalPages: 1 })
    if (url.pathname.includes('reviews')) return send({ items: [], nextCursor: null, hasNext: false })
    if (url.pathname.includes('toilets')) return send({ meta: { total_count: 1, display_type: 'TOILET' }, toilets: [facility], clusters: [] })
    return send({})
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const api = `http://127.0.0.1:${server.address().port}`
  const options = {
    cwd: process.cwd(), windowsHide: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', SITE_INDEXABLE: 'false', ENGLISH_UI_PREVIEW: 'true',
      NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY: 'synthetic-local-sdk-not-a-real-key',
      NEXT_PUBLIC_API_BASE_URL: api, TOILET_API_ORIGIN: api, SHARED_TOILET_CACHE_ENABLED: 'false', REVIEW_API_ENABLED: 'false' }, stdio: ['ignore', 'pipe', 'pipe'],
  }
  if (process.env.TEST_PRODUCTION === '1') {
    next = spawn(process.execPath, [path.resolve('node_modules/next/dist/bin/next'), 'build'], options)
    for (const stream of [next.stdout, next.stderr]) stream.on('data', chunk => { logs = (logs + chunk.toString()).slice(-12000) })
    const code = await new Promise(resolve => next.once('exit', resolve))
    assert.equal(code, 0, logs)
    console.log('PASS optimized build')
  }
  next = spawn(process.execPath, [path.resolve('node_modules/next/dist/bin/next'), process.env.TEST_PRODUCTION === '1' ? 'start' : 'dev', '--hostname', '127.0.0.1', '--port', '3185'], options)
  for (const stream of [next.stdout, next.stderr]) stream.on('data', chunk => { logs = (logs + chunk.toString()).slice(-12000) })
  let ready = false
  for (let attempt = 0; attempt < 40; attempt++) {
    if (next.exitCode !== null) throw new Error(`Next exited: ${logs}`)
    try { const response = await fetch(origin + '/en', { signal: AbortSignal.timeout(2000) }); if (response.status === 200) { ready = true; break } } catch {}
    await pause(300)
  }
  assert.ok(ready, logs)
  for (const [url, lang] of [['/', 'ko'], ['/en', 'en'], ['/en/toilet/123', 'en'], ['/toilet/123', 'ko']]) {
    const response = await fetch(origin + url)
    const html = await response.text()
    assert.equal(response.status, 200, `${url}: ${html.slice(0, 200)}`)
    assert.match(html, new RegExp(`<html[^>]*lang="${lang}"`), `SSR document language ${url}`)
    if (url.startsWith('/en')) assert.match(html, /noindex/)
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 1280, height: 850 }]) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500, serviceWorkers: 'block', ...(viewport.width < 500 ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' } : {}) })
    await context.route('**/*', route => {
      const url = new URL(route.request().url())
      return [origin, api].includes(url.origin) ? route.continue() : route.abort()
    })
    await context.addInitScript(() => {
      class Point { constructor(lat, lng) { this.lat = lat; this.lng = lng } getLat() { return this.lat } getLng() { return this.lng } }
      class MapStub {
        constructor(container, options) { this.container = container; this.center = options.center; this.level = options.level; window.__mapCount = (window.__mapCount || 0) + 1; window.__lastMap = this }
        getCenter() { return this.center } setCenter(p) { this.center = p } panTo(p) { this.center = p }
        getLevel() { return this.level } setLevel(v) { this.level = v } relayout() {} setDraggable() {} setZoomable() {}
        getBounds() { return { getSouthWest: () => new Point(36, 127), getNorthEast: () => new Point(37, 128) } }
        getProjection() { return { pointFromCoords: () => ({ x: 170, y: 200 }), containerPointFromCoords: () => ({ x: 170, y: 200 }) } }
      }
      class Overlay { constructor(options) { this.content = options.content } setMap(map) { if (map) { if (!this.content.isConnected) map.container.append(this.content) } else this.content.remove() } }
      window.kakao = { maps: { Map: MapStub, LatLng: Point, CustomOverlay: Overlay, load: callback => callback(),
        event: { addListener() {}, preventMap() {} }, services: { Status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT' },
          Places: class { keywordSearch(query, callback) { callback([], 'ZERO_RESULT') } }, Geocoder: class { coord2Address(a, b, callback) { callback([], 'ZERO_RESULT') } } } } }
      Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(ok, fail) { if (window.__fixtureLocation) ok({ coords: { latitude: 36.35, longitude: 127.38, accuracy: 10 }, timestamp: Date.now() }); else fail({ code: 1 }) }, watchPosition() { return 1 }, clearWatch() {} } })
      document.addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = 'nextjs-portal{pointer-events:none!important}'; document.head.append(style) })
    })
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(origin + '/toilet/123')
    await page.locator('.language-selector-trigger').waitFor()
    await page.waitForFunction(() => Boolean(window.__lastMap))
    const before = await page.evaluate(() => ({ count: window.__mapCount, level: window.__lastMap.getLevel(), lat: window.__lastMap.getCenter().getLat() }))
    const mapNode = await page.locator('.map').elementHandle()
    assert.equal(await page.locator('.mobile-header-actions .auth-button').count(), 0)
    if (viewport.width < 500) assert.equal(await page.locator('.mobile-header-actions .header-menu-trigger').count(), 0)
    await page.locator('.language-selector-trigger').click()
    await page.getByRole('menuitemradio', { name: 'English' }).click()
    await page.waitForURL('**/en/toilet/123')
    await page.waitForFunction(() => document.documentElement.lang === 'en')
    assert.ok(await mapNode.evaluate(node => node === document.querySelector('.map')), 'map DOM must survive locale change')
    assert.deepEqual(await page.evaluate(() => ({ count: window.__mapCount, level: window.__lastMap.getLevel(), lat: window.__lastMap.getCenter().getLat() })), before)
    assert.equal(await page.locator('.language-selector-trigger img').getAttribute('src'), '/flags/us.svg')
    await page.locator('.language-selector-trigger').click()
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('menu').count(), 0)
    assert.equal(await page.locator('.language-selector-trigger').evaluate(node => node === document.activeElement), true)
    await page.locator('.language-selector-trigger').click()
    await page.locator('.brand').first().focus() // Leaving menu closes it without navigation.
    assert.equal(await page.getByRole('menu').count(), 0)
    await page.goBack()
    await page.waitForURL('**/toilet/123')
    await page.waitForFunction(() => document.documentElement.lang === 'ko')
    await page.goForward()
    await page.waitForFunction(() => document.documentElement.lang === 'en')
    assert.ok(await mapNode.evaluate(node => node === document.querySelector('.map')), 'history must retain map')
    await page.locator('.language-selector-trigger').click()
    const menu = await page.getByRole('menu').boundingBox()
    assert.ok(menu.x >= 0 && menu.x + menu.width <= viewport.width, 'language menu remains inside viewport')
    await page.screenshot({ path: path.resolve(`.next/i18n-${viewport.width}.png`), animations: 'disabled' })
    await page.evaluate(() => sessionStorage.setItem('geupddong.language-login-return.v1', JSON.stringify({ path: '/en/toilet/123', savedAt: Date.now() })))
    await page.goto(origin + '/?login=failed')
    await page.waitForURL('**/en/toilet/123*')
    await page.waitForFunction(() => document.documentElement.lang === 'en')
    assert.equal(await page.evaluate(() => sessionStorage.getItem('geupddong.language-login-return.v1')), null)
    await page.locator('.review-entry').click()
    await page.getByRole('dialog', { name: 'Log in or sign up' }).waitFor()
    assert.equal(await page.locator('.login-modal p').first().innerText(), 'Log in to write a review.')
    assert.deepEqual(await page.locator('.login-modal .social-login').allTextContents(), ['Continue with Google', 'Continue with Kakao'])
    await page.getByRole('button', { name: 'Close login' }).click()
    if (viewport.width < 500) {
      const nav = page.getByRole('navigation', { name: 'Main navigation' })
      await nav.getByRole('button', { name: 'My page', exact: true }).click()
      await page.getByRole('heading', { name: 'Log in or sign up' }).waitFor()
      assert.deepEqual(await page.locator('.mobile-login-landing .social-login').allTextContents(), ['Continue with Google', 'Continue with Kakao'])
      // Only the loopback fixture recognizes this cookie; it is not a real credential.
      await context.addCookies([{ name: 'fixture-login', value: '1', url: api }])
      await page.goto(origin + '/en/toilet/123')
      await nav.getByRole('button', { name: 'My page', exact: true }).click()
      await page.getByRole('heading', { name: '합성 닉네임' }).waitFor()
      await page.getByRole('button', { name: 'My reports', exact: false }).click()
      await page.getByRole('button', { name: /Opening-hours report/ }).click()
      assert.ok(await page.getByText('작성자가 남긴 제보 원문', { exact: true }).isVisible())
      assert.ok(await page.getByText('관리자 답변 원문', { exact: true }).isVisible())
      await page.getByRole('button', { name: 'Choose dates', exact: true }).click()
      await page.getByRole('button', { name: 'Start date', exact: true }).waitFor()
      assert.equal(await page.getByRole('columnheader').first().innerText(), 'Su')
      const dateRow = await page.locator('.history-date-inputs').boundingBox()
      assert.ok(dateRow.x >= 0 && dateRow.x + dateRow.width <= viewport.width + 1, 'date range controls fit mobile width')
      await page.screenshot({ path: path.resolve(`.next/i18n-history-${viewport.width}.png`), animations: 'disabled' })
      await page.getByRole('button', { name: 'Apply', exact: true }).click()
      await nav.getByRole('button', { name: /Notifications/ }).click()
      await page.getByText('Report approved', { exact: true }).waitFor()
      assert.ok(await page.getByText('합성 알림 원문', { exact: true }).isVisible())
      assert.ok(await page.getByText('Original', { exact: true }).isVisible())
      await nav.getByRole('button', { name: 'Map', exact: true }).click()
      await page.evaluate(() => { window.__fixtureLocation = true })
      await page.locator('.review-entry').click()
      await page.getByRole('dialog', { name: 'Write a review', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Post review', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: 'Rate both satisfaction and cleanliness.' }).waitFor()
      await page.getByRole('radio', { name: 'Satisfaction: 4 out of 5', exact: true }).check()
      await page.getByRole('radio', { name: 'Cleanliness: 5 out of 5', exact: true }).check()
      await page.getByRole('button', { name: 'Available', exact: true }).click()
      await page.getByRole('button', { name: 'Wait time: 30 min', exact: true }).click()
      await page.locator('#review-comment').fill('리뷰 원문 🙂')
      assert.equal(await page.getByRole('slider', { name: 'Wait time', exact: true }).getAttribute('aria-valuetext'), '30 min')
      await page.screenshot({ path: path.resolve(`.next/i18n-review-${viewport.width}.png`), animations: 'disabled' })
      await page.getByRole('button', { name: 'Post review', exact: true }).click()
      await page.getByRole('dialog', { name: 'Review saved', exact: true }).waitFor()
      await page.getByRole('button', { name: 'View my reviews', exact: true }).click()
      await page.locator('.rv-my-item').click()
      assert.equal(await page.locator('.rv-full-comment').innerText(), '리뷰 원문 🙂')
      await page.getByRole('button', { name: 'Edit', exact: true }).click()
      assert.equal(await page.locator('#review-comment').inputValue(), '리뷰 원문 🙂')
      await page.locator('#review-comment').fill('수정한 원문')
      await page.getByRole('button', { name: 'Save changes', exact: true }).click()
      await page.getByRole('button', { name: 'Back to list', exact: true }).click()
      await page.getByRole('button', { name: 'Remove author details', exact: true }).click()
      await page.getByText(/written text will not be deleted/).waitFor()
      await page.getByRole('button', { name: 'Remove details', exact: true }).click()
      assert.equal(await page.locator('.rv-my-item').count(), 0)
      await nav.getByRole('button', { name: 'Map', exact: true }).click()
      await page.locator('.review-card-report').click()
      await page.getByRole('button', { name: /Opening-hours report/ }).click()
      await page.getByRole('button', { name: 'Send opening-hours report', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: 'Enter a reason for your report.' }).waitFor()
      await page.getByPlaceholder('For example: 09:00–18:00').fill('09:00~18:00')
      await page.getByPlaceholder('For example: Updated according to the sign on site.').fill('보존할 제보 원문')
      await page.getByRole('button', { name: 'Send opening-hours report', exact: true }).click()
      await page.getByRole('heading', { name: 'Report received', exact: true }).waitFor()
      assert.equal(reportWrites.at(-1).reason, '보존할 제보 원문')
      assert.equal(reportWrites.at(-1).openTime, '09:00~18:00')
      console.log(`PASS ${viewport.width}px: English login, report/calendar, notification original, memory review create/edit/unlink and fixture-only report submission`)
    }
    assert.deepEqual(errors, [])
    console.log(`PASS ${viewport.width}px: SSR language, header, switch, menu, history and map preservation`)
    await context.close()
  }
}
main().catch(error => { console.error(error); console.error(logs); process.exitCode = 1 }).finally(async () => {
  if (browser) await browser.close()
  if (next && next.exitCode === null) {
    if (process.platform === 'win32') {
      try { execFileSync('taskkill', ['/PID', String(next.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 }) }
      catch {
        console.error(`CLEANUP REQUIRED: could not stop this test's Next server, PID ${next.pid}.`)
        process.exitCode = 1
      }
    }
    else next.kill()
  }
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})
