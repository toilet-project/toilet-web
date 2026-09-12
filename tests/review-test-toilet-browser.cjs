// Read-only preview acceptance: fake identities/GPS only in this disposable browser.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright')
const origin = process.env.REVIEW_PREVIEW_ORIGIN || 'http://127.0.0.1:4187'
assert.ok(['http://127.0.0.1:4187', 'https://preview.geupddong.com'].includes(origin))
const output = process.env.REVIEW_SCREENSHOT_DIR || path.resolve('.tmp-review-screenshots')
const mobileUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
fs.mkdirSync(output, { recursive: true })
const hash = '#review-test=36.3504,127.3845' // Public city hall; never commit personal test coordinates.
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const width of [390, 320, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: width > 600 ? 1000 : 844 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: 'block', userAgent: mobileUserAgent })
      let signedIn = true, writes = 0, fakeRequests = 0
      await context.route('**/*', async route => {
        const request = route.request(), u = new URL(request.url())
        if (u.pathname === '/api/v1/auth/me') return route.fulfill({ json: signedIn ? { userId: 'review-fixture-only', displayName: '시험 사용자', status: 'ACTIVE', roles: ['USER'], consentRequired: false } : null })
        if (u.pathname === '/api/v1/notifications/unread-count') return route.fulfill({ json: { count: 0 } })
        if (u.pathname === '/api/v1/toilets') return route.fulfill({ json: { meta: { map_level: 4, display_type: 'MARKER', total_count: 0, result_count: 0 }, toilets: [], clusters: [] } })
        if (/\/toilets?\/-/.test(u.pathname)) { fakeRequests++; return route.abort() }
        if (u.pathname === '/cdn-cgi/rum') return route.fulfill({ status: 204 })
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) { writes++; return route.abort() }
        if (origin.includes('127.0.0.1') && u.hostname === 'dapi.kakao.com') return route.abort()
        return route.continue()
      })
      await context.addInitScript(() => {
        window.fixtureGPS = { latitude: 36.3504, longitude: 127.3845, accuracy: 10, age: 0 }
        window.fixtureGeoCalls = 0
        Object.defineProperty(navigator, 'geolocation', { value: {
          getCurrentPosition(ok) { window.fixtureGeoCalls++; const fix = { ...window.fixtureGPS }; setTimeout(() => ok({ coords: fix, timestamp: Date.now() - fix.age }), 20) },
          watchPosition() { return 1 }, clearWatch() {},
        } })
      })
      if (origin.includes('127.0.0.1')) await context.addInitScript(() => {
        class LatLng { constructor(lat,lng){this.lat=lat;this.lng=lng} getLat(){return this.lat} getLng(){return this.lng} }
        class MapMock {
          constructor(el,options){this.el=el;this.center=options.center;this.level=options.level;this.listeners={}}
          getCenter(){return this.center} getLevel(){return this.level}
          getBounds(){return {getSouthWest:()=>new LatLng(36.34,127.37),getNorthEast:()=>new LatLng(36.36,127.39)}}
          getProjection(){return {pointFromCoords:()=>({x:innerWidth>600?700:180,y:300})}}
          relayout(){} panTo(p){this.center=p} setCenter(p){this.center=p} setDraggable(){} setZoomable(){} setLevel(v){this.level=v}
        }
        class Overlay { constructor(options){this.options=options} setMap(map){this.options.content.remove();if(map){Object.assign(this.options.content.style,{position:'absolute',left:innerWidth>600?'700px':'130px',top:'160px'});map.el.append(this.options.content)}} }
        window.kakao={maps:{Map:MapMock,LatLng,CustomOverlay:Overlay,event:{preventMap(){},addListener(map,name,fn){(map.listeners[name]??=[]).push(fn)}},services:{Status:{OK:'OK',ZERO_RESULT:'ZERO'}}}}
      })
      const page = await context.newPage(), errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(origin + '/' + hash, { waitUntil: 'networkidle' })
      if (origin.includes('127.0.0.1')) await page.addStyleTag({ content: 'nextjs-portal { pointer-events:none!important }' })
      const card = page.locator('.map-stage .place-card')
      await card.getByRole('heading', { name: '리뷰 테스트 화장실' }).waitFor()
      assert.equal(await page.locator('.review-test-marker').count(), 1)
      assert.equal(await card.getByRole('button', { name: '정보 제공하기' }).isDisabled(), true)
      assert.match(await card.innerText(), /실제 시설 아님/)
      await page.screenshot({ path: path.join(output, `review-test-toilet-${width}.png`) })
      const openReview = () => card.getByRole('button', { name: '리뷰', exact: true }).click()
      const form = page.getByRole('dialog', { name: '리뷰 쓰기', exact: true })
      await page.evaluate(() => { window.fixtureGPS.latitude += 0.02 })
      await openReview()
      await page.locator('.review-entry-hint').filter({hasText:'150m 이내'}).waitFor()
      const hint=page.locator('.review-entry-hint'), button=card.locator('.review-entry')
      const h=await hint.boundingBox(), b=await button.boundingBox()
      assert.ok(Math.min(Math.abs(b.y-h.y-h.height),Math.abs(h.y-b.y-b.height))<=11,'hint sits beside the review action, not the top of the map')
      assert.ok(h.x>=0 && h.x+h.width<=width,'hint fits viewport')
      assert.equal(await hint.evaluate(el=>{const r=el.getBoundingClientRect();el.style.pointerEvents='auto';const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;el.style.pointerEvents='';return hit}),true,'portal stays above card clipping')
      await page.screenshot({path:path.join(output,`review-hint-${width}.png`)})
      assert.equal(await form.count(), 0, 'out-of-range shows only an anchored hint')
      if (width <= 390) {
        await card.getByRole('button', { name: '정보 닫기' }).click()
        await hint.waitFor({ state: 'detached' })
        await page.locator('.review-test-marker').click()
        await card.getByRole('heading', { name: '리뷰 테스트 화장실' }).waitFor()
      }
      await page.evaluate(() => { window.fixtureGPS.latitude = 36.3504 })
      await openReview()
      await page.waitForFunction(() => document.querySelector('.rv-dialog-footer .rv-primary')?.disabled === false)
      await form.getByRole('radio', { name: '만족도 4점' }).check()
      await form.getByRole('radio', { name: '청결도 5점' }).check()
      await form.getByRole('button', { name: '있었어요', exact: true }).click()
      await form.getByRole('button', { name: '리뷰 남기기', exact: true }).click()
      await page.getByRole('dialog', { name: '리뷰를 저장했어요', exact: true }).waitFor()
      await page.getByRole('button', { name: '지도로 돌아가기', exact: true }).click()
      for (let i=0;i<2;i++) {
        if (i === 1) await page.evaluate(() => { const now = Date.now; Date.now = () => now() + 61000 })
        await card.getByRole('button', { name: '정보 닫기' }).click()
        await page.locator('.review-test-marker').click()
        await card.getByRole('heading', { name: '리뷰 테스트 화장실' }).waitFor()
        assert.equal(new URL(page.url()).pathname, '/')
      }
      assert.equal(new URL(page.url()).hash, hash)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      // Removing/adding the fragment in an already-open tab also removes/recreates the fixture.
      await page.evaluate(() => { window.location.hash = '' })
      await page.waitForFunction(() => !document.querySelector('.review-test-marker'))
      signedIn = false
      await page.evaluate(value => { window.location.hash = value }, hash)
      await card.getByRole('heading', { name: '리뷰 테스트 화장실' }).waitFor()
      const geoCalls = await page.evaluate(() => window.fixtureGeoCalls)
      await openReview()
      await page.getByRole('button', { name: /Google로 계속하기/ }).waitFor()
      assert.equal(await form.count(), 0)
      assert.equal(await page.evaluate(() => window.fixtureGeoCalls), geoCalls)
      assert.equal(writes, 0); assert.equal(fakeRequests, 0); assert.deepEqual(errors, [])
      console.log(JSON.stringify({ width, fakeMarker: 1, realLocationGate: true, realLoginGate: true, fragmentLifecycle: true, businessWrites: writes, fakeIdRequests: fakeRequests }))
      await context.close()
    }
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
