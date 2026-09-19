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
async function main() {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    res.setHeader('content-type', 'application/json')
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('access-control-allow-credentials', 'true')
    res.setHeader('access-control-allow-headers', 'content-type')
    const send = (body, status = 200) => { res.statusCode = status; res.end(JSON.stringify(body)) }
    if (req.method === 'OPTIONS') return send({})
    if (req.method !== 'GET') return send({}, 405)
    if (url.pathname === '/api/v1/toilets/123') return send(facility)
    if (url.pathname.startsWith('/api/v1/toilets/') && /\/\d+$/.test(url.pathname)) return send({}, 404)
    if (url.pathname.includes('auth')) return send({}, 401)
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
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 850 }]) {
    const context = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500, serviceWorkers: 'block' })
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
      Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(ok, fail) { fail({ code: 1 }) }, watchPosition() { return 1 }, clearWatch() {} } })
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
    assert.deepEqual(errors, [])
    console.log(`PASS ${viewport.width}px: SSR language, header, switch, menu, history and map preservation`)
    await context.close()
  }
}
main().catch(error => { console.error(error); console.error(logs); process.exitCode = 1 }).finally(async () => {
  if (browser) await browser.close()
  if (next && next.exitCode === null) {
    if (process.platform === 'win32') { try { execFileSync('taskkill', ['/PID', String(next.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }) } catch {} }
    else next.kill()
  }
  if (server) await new Promise(resolve => server.close(resolve))
})
