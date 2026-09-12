// Synthetic public facilities/account; report dialogs only, never submit a report.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright')
const origin = process.env.REVIEW_PREVIEW_ORIGIN || 'http://127.0.0.1:4187'
assert.ok(['http://127.0.0.1:4187', 'https://preview.geupddong.com'].includes(origin))
const local = origin.includes('127.0.0.1')
const output = process.env.REVIEW_SCREENSHOT_DIR || path.resolve('.tmp-group-report-screenshots')
fs.mkdirSync(output, { recursive: true })
const items = [
  { id: 13543, name: '목록 버튼 시험 A', toiletType: '공중화장실', latitude: 36.369, longitude: 127.344 },
  { id: 13144, name: '목록 버튼 시험 B', toiletType: '공중화장실', latitude: 36.369, longitude: 127.344 },
  { id: 13032, name: '단일 카드 시험', toiletType: '개방화장실', latitude: 36.365, longitude: 127.346 },
]
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const width of [320, 390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: width > 600 ? 1000 : 844 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: 'block' })
      let signedIn = true, writes = 0
      await context.route('**/*', async route => {
        const req = route.request(), u = new URL(req.url())
        if (u.pathname === '/cdn-cgi/rum') return route.fulfill({ status: 204 })
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { writes++; return route.abort() }
        // Let the controlled detail fixture arrive first, independently of public SSR navigation.
        if (u.searchParams.has('_rsc') && u.pathname.startsWith('/toilet/')) {
          await new Promise(resolve => setTimeout(resolve, 1200))
          return route.continue().catch(() => {})
        }
        if (u.pathname === '/api/v1/auth/me') return route.fulfill({ json: signedIn ? { userId: 'group-button-fixture', displayName: '시험 사용자', status: 'ACTIVE', roles: ['USER'], consentRequired: false } : null })
        if (u.pathname === '/api/v1/notifications/unread-count') return route.fulfill({ json: { count: 0 } })
        if (u.pathname === '/api/v1/toilets') return route.fulfill({ json: { meta: { map_level: 3, display_type: 'MARKER', total_count: 3, result_count: 3 }, toilets: items, clusters: [] } })
        const match = u.pathname.match(/^\/api\/v1\/toilets\/(\d+)$/)
        if (match) {
          const item = items.find(item => item.id === Number(match[1]))
          assert.ok(item, 'only fixture detail IDs are requested')
          await new Promise(resolve => setTimeout(resolve, 600))
          return route.fulfill({ json: { ...item, roadAddress: '가상 주소', jibunAddress: '', openTime: '평일 06:00 ~ 23:00 / 주말·공휴일 07:00 ~ 22:00', openTimeDetail: '', maleToiletCount: 2, femaleToiletCount: 3, hasCctv: 'Y', hasEmergencyBell: 'N', hasDiaperTable: 'N' } })
        }
        if (u.pathname.startsWith('/api/v1/')) return route.fulfill({ json: [] })
        if (local && u.hostname === 'dapi.kakao.com') return route.abort()
        return route.continue()
      })
      if (local) await context.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = 'nextjs-portal {display:none!important}'; document.head.append(style) })
        class LatLng { constructor(lat,lng){this.lat=lat;this.lng=lng}getLat(){return this.lat}getLng(){return this.lng} }
        class MapMock { constructor(el,options){this.el=el;this.center=options.center;this.level=options.level;this.listeners={}}getCenter(){return this.center}getLevel(){return this.level}getBounds(){return {getSouthWest:()=>new LatLng(36.35,127.33),getNorthEast:()=>new LatLng(36.38,127.36)}}getProjection(){return {pointFromCoords:()=>({x:700,y:300})}}relayout(){}panTo(p){this.center=p}setCenter(p){this.center=p}setDraggable(){}setZoomable(){}setLevel(v){this.level=v} }
        class Overlay { constructor(options){this.options=options}setMap(map){this.options.content.remove();if(map){Object.assign(this.options.content.style,{position:'absolute',left:'100px',top:'120px'});map.el.append(this.options.content)}} }
        window.kakao={maps:{Map:MapMock,LatLng,CustomOverlay:Overlay,event:{preventMap(){},addListener(map,name,fn){(map.listeners[name]??=[]).push(fn)}},services:{Status:{OK:'OK',ZERO_RESULT:'ZERO'}}}}
      })
      let page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      const openGroup = async () => {
        if (width < 600) await page.locator('.mobile-area-list-button').click()
        const listClass = width < 600 ? 'mobile' : 'desktop'
        await page.locator(`.${listClass}-area-list-item`).filter({ has: page.locator(`.${listClass}-area-list-additional`) }).click()
        await page.locator('.coordinate-group-item-toggle').first().click()
      }
      await page.goto(origin + '/', { waitUntil: 'networkidle' })
      await openGroup()
      const expanded = page.locator('.coordinate-group-item.is-expanded'), action = expanded.locator('.coordinate-opening-row .review-card-report')
      await action.waitFor()
      assert.equal(await action.isDisabled(), true, 'loading details cannot start a report')
      try { await page.waitForFunction(() => document.querySelector('.coordinate-opening-row .review-card-report')?.disabled === false, null, { timeout: 5000 }) }
      catch (error) { await page.screenshot({ path: path.join(output, `group-report-loading-failure-${width}.png`) }); throw error }
      assert.equal(await expanded.getByRole('button', { name: '정보 제공하기', exact: true }).count(), 1, 'exactly one report entry per expanded item')
      assert.equal(await expanded.locator('.coordinate-group-item-toggle .review-card-report').count(), 0)
      assert.equal(await action.innerText(), '', 'icon-only entry has no visible text')
      assert.equal(await action.getAttribute('aria-label'), '정보 제공하기')
      assert.equal(await action.locator('svg').getAttribute('width'), '24')
      assert.equal(await action.evaluate(el => getComputedStyle(el).color), 'rgb(196, 64, 60)')
      const button = await action.boundingBox(), hours = await expanded.locator('.open-time').boundingBox(), toggle = await expanded.locator('.coordinate-group-item-toggle').boundingBox()
      assert.equal(button.width, 44); assert.equal(button.height, 44)
      assert.ok(button.x >= hours.x + hours.width + 11 && Math.abs(button.y + button.height / 2 - hours.y - hours.height / 2) < 1, 'siren aligns beside hours with clear spacing')
      assert.ok(button.y >= toggle.y + toggle.height + 7, 'report action is separated from collapse')
      assert.equal(await expanded.evaluate(el => el.scrollWidth > el.clientWidth), false)
      await page.screenshot({ path: path.join(output, `group-report-entry-${width}.png`) })
      const targetName = await expanded.locator('.coordinate-group-name').innerText()
      await action.click()
      await page.locator('.report-target strong').filter({ hasText: targetName }).waitFor()
      assert.equal(await expanded.locator('.coordinate-group-item-toggle').getAttribute('aria-expanded'), 'true', 'report click does not collapse the list')
      await page.getByRole('button', { name: '제보 닫기', exact: true }).click()
      await expanded.locator('.coordinate-group-item-toggle').click()
      assert.equal(await page.locator('.coordinate-opening-row').count(), 0, 'collapse removes detail actions')
      await page.getByRole('button', { name: '목록 닫기', exact: true }).click()
      if (width < 600) await page.locator('.mobile-area-list-button').click()
      await page.locator(width < 600 ? '.mobile-area-list-item' : '.desktop-area-list-item').filter({ hasText: '단일 카드 시험' }).click()
      const single = page.locator('.place-card .review-card-title-row .review-card-report')
      await single.waitFor()
      assert.equal(await single.innerText(), '제보', 'single-card report retains its text and title-row position')
      assert.notEqual(await single.evaluate(el => getComputedStyle(el).color), 'rgb(196, 64, 60)')
      signedIn = false
      await page.close()
      page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(origin + '/', { waitUntil: 'networkidle' })
      await openGroup()
      try { await page.waitForFunction(() => document.querySelector('.coordinate-opening-row .review-card-report')?.disabled === false) }
      catch (error) { await page.screenshot({ path: path.join(output, `group-report-guest-failure-${width}.png`) }); throw error }
      await page.locator('.coordinate-opening-row .review-card-report').click()
      await page.getByRole('dialog', { name: '로그인 · 간편가입', exact: true }).waitFor()
      assert.equal(await page.locator('.report-modal').count(), 0, 'signed-out report still requires login')
      assert.equal(writes, 0); assert.deepEqual(errors, [])
      console.log(`PASS group report ${width}: hours-row red siren, 44px hit area, no duplicate/collapse collision, loading guard, correct target, login guard, single-card unchanged; no business writes`)
      await context.close()
    }
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
