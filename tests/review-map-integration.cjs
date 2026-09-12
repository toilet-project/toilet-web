// Existing map UI, not the standalone review page. Real public toilet reads only;
// identities are fixtures and all business writes are blocked.
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright')
const origin = process.env.REVIEW_PREVIEW_ORIGIN || 'http://127.0.0.1:4187'
const mobileUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
assert.ok(['http://127.0.0.1:4187', 'https://preview.geupddong.com'].includes(origin))
const output = process.env.REVIEW_SCREENSHOT_DIR || path.resolve('.tmp-review-screenshots')
fs.mkdirSync(output, { recursive: true })
const local = origin.includes('127.0.0.1')
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const width of [390, 320, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: width > 600 ? 1000 : 844 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: 'block', userAgent: mobileUserAgent })
      await context.addInitScript(() => {
        window.reviewTestFix = { latitude: 36.369, longitude: 127.345, accuracy: 10, age: 0, denied: false }
        window.reviewTestGeoCalls = 0
        // Explicit synthetic geolocation, confined to this disposable test context.
        Object.defineProperty(navigator, 'geolocation', { value: {
          getCurrentPosition(ok, fail, options) {
            window.reviewTestGeoCalls++; window.reviewTestGeoOptions = options
            const fix = { ...window.reviewTestFix }
            const complete = () => fix.denied ? fail({ code: 1 }) : ok({ coords: fix, timestamp: Date.now() - fix.age })
            if (fix.hold) window.reviewReleaseGeo = complete; else setTimeout(complete, 30)
          },
          watchPosition() { return 1 }, clearWatch() {},
        } })
      })
      let signedIn = true
      let authHold = null
      let businessWrites = 0
      const errors = []
      await context.route('**/*', async route => {
        const req = route.request(), u = new URL(req.url())
        if (u.pathname === '/api/v1/auth/me') {
          if (authHold) await authHold
          return route.fulfill({ json: signedIn ? { userId: 'review-map-fixture', displayName: '리뷰 검증 사용자', status: 'ACTIVE', roles: ['USER'], consentRequired: false } : null })
        }
        if (u.pathname === '/api/v1/notifications/unread-count') return route.fulfill({ json: { count: 0 } })
        if (u.pathname === '/cdn-cgi/rum' && req.method() === 'POST') return route.fulfill({ status: 204 })
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { businessWrites++; return route.abort() }
        if (u.pathname.startsWith('/api/v1/') && !u.pathname.startsWith('/api/v1/toilets')) return route.fulfill({ json: [] })
        if (local && u.hostname === 'dapi.kakao.com') return route.abort()
        return route.continue()
      })
      if (local) await context.addInitScript(() => {
        class LatLng { constructor(lat,lng) { this.lat=lat;this.lng=lng } getLat(){return this.lat} getLng(){return this.lng} }
        class MapMock {
          constructor(el,options){this.el=el;this.center=options.center;this.level=options.level;this.listeners={}}
          getCenter(){return this.center} getLevel(){return this.level}
          getBounds(){return {getSouthWest:()=>new LatLng(36.35,127.33),getNorthEast:()=>new LatLng(36.38,127.36)}}
          getProjection(){return {pointFromCoords:()=>({x:innerWidth>600?700:180,y:300})}}
          relayout(){} panTo(p){this.center=p} setCenter(p){this.center=p} setDraggable(){} setZoomable(){} setLevel(v){this.level=v}
        }
        class Overlay {constructor(options){this.options=options} setMap(map){this.options.content.remove();if(map){Object.assign(this.options.content.style,{position:'absolute',left:'100px',top:'120px'});map.el.append(this.options.content)}}}
        window.kakao={maps:{Map:MapMock,LatLng,CustomOverlay:Overlay,event:{preventMap(){},addListener(map,name,fn){(map.listeners[name]??=[]).push(fn)}},services:{Status:{OK:'OK',ZERO_RESULT:'ZERO'}}}}
      })
      const page = await context.newPage()
      const details = new Map()
      page.on('response', async response => {
        if (/\/api\/v1\/toilets\/\d+$/.test(new URL(response.url()).pathname) && response.ok()) {
          try { const value = await response.json(); details.set(value.name, value) } catch { /* only retain public detail responses */ }
        }
      })
      page.on('pageerror',e=>errors.push(e.message))
      page.on('console', message=> { if(message.type()==='error' && /지도|TypeError/.test(message.text())) console.error(message.text()) })
      await page.goto(origin+'/toilet/13144', { waitUntil:'networkidle' })
      if (local) await page.addStyleTag({ content: 'nextjs-portal { pointer-events: none!important; }' })
      await page.locator('.app-shell[data-review-design-preview=true]').waitFor()
      const detail = await (await context.request.get('https://api.geupddong.com/api/v1/toilets/13144')).json()
      await page.evaluate(point => Object.assign(window.reviewTestFix, point), { latitude: detail.latitude, longitude: detail.longitude })
      const card = page.locator('.map-stage .place-card').first()
      await card.getByRole('button',{name:'리뷰',exact:true}).waitFor()
      const name = await card.locator('.place-card-summary h1').innerText()
      const before = await card.locator('.distance-value').innerText()
      const url = page.url()
      assert.equal(await card.locator('.review-card-title-row').getByRole('button',{name:'정보 제공하기'}).count(),1)
      await page.screenshot({path:path.join(output,`map-review-card-${width}.png`)})
      let releaseAuth
      authHold = new Promise(resolve => { releaseAuth = resolve })
      await page.evaluate(()=>{window.reviewTestFix.hold=true;window.reviewTestFix.age=240000})
      const openStarted = Date.now(), cardBefore = await card.boundingBox()
      await card.getByRole('button',{name:'리뷰',exact:true}).click()
      const form = page.getByRole('dialog',{name:'리뷰 쓰기',exact:true})
      const entry = card.locator('.review-entry')
      await page.waitForFunction(()=>document.querySelector('.review-entry.is-checking'))
      const openMs = Date.now() - openStarted
      assert.equal(await form.count(),0,'no review modal before eligibility passes')
      assert.equal(await entry.isDisabled(),true)
      assert.equal(await entry.getAttribute('aria-busy'),'true')
      assert.equal(await entry.locator('svg').evaluate(el=>getComputedStyle(el).animationName),'review-entry-spin')
      assert.deepEqual(await card.boundingBox(),cardBefore,'checking cannot resize or shift the card')
      await page.emulateMedia({ reducedMotion: 'reduce' })
      assert.equal(await entry.locator('svg').evaluate(el=>getComputedStyle(el).animationName),'none')
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.screenshot({path:path.join(output,`map-review-pending-${width}.png`)})
      await page.waitForFunction(()=>typeof window.reviewReleaseGeo==='function')
      assert.equal(await page.evaluate(()=>window.reviewTestGeoOptions.maximumAge),300000,'reuse only browser fixes within five minutes')
      const callsBefore=await page.evaluate(()=>window.reviewTestGeoCalls)
      await entry.evaluate(el=>{el.click();el.click()})
      assert.equal(await page.evaluate(()=>window.reviewTestGeoCalls),callsBefore,'busy button cannot duplicate GPS checks')
      await page.evaluate(()=>{window.reviewReleaseGeo();window.reviewTestFix.hold=false;delete window.reviewReleaseGeo})
      await entry.getByRole('status').filter({hasText:'로그인 상태'}).waitFor()
      assert.equal(await form.count(),0,'GPS alone cannot open the editor')
      releaseAuth(); authHold = null
      await page.waitForFunction(()=>document.querySelector('.rv-dialog-footer .rv-primary')?.disabled===false)
      await form.getByRole('radio',{name:'만족도 4점'}).check()
      await form.getByRole('radio',{name:'청결도 5점'}).check()
      const paperYes = form.getByRole('button',{name:'있었어요',exact:true}), paperNo = form.getByRole('button',{name:'없었어요',exact:true})
      await paperNo.click()
      assert.equal(await paperNo.getAttribute('aria-pressed'),'true')
      assert.equal(await paperNo.evaluate(el=>getComputedStyle(el).color),'rgb(165, 59, 54)')
      await page.screenshot({path:path.join(output,`map-review-paper-no-${width}.png`)})
      await paperYes.click()
      assert.equal(await paperNo.getAttribute('aria-pressed'),'false')
      assert.equal(await paperYes.evaluate(el=>getComputedStyle(el).color),'rgb(36, 94, 156)')
      const topBefore = await form.boundingBox()
      await form.getByRole('radio',{name:'만족도 3점'})[width < 600 ? 'tap' : 'click']()
      assert.equal(await form.getByRole('radio',{name:'만족도 3점'}).isChecked(),true)
      await form.getByRole('radio',{name:'만족도 4점'})[width < 600 ? 'tap' : 'click']()
      assert.equal(await form.getByRole('button',{name:/^(원활|대기|혼잡)$/}).count(),0)
      const starGeometry = await form.locator('.rv-rating-line').first().evaluate(row => {
        const star = row.querySelector('.rv-stars').getBoundingClientRect(), score = row.querySelector('output').getBoundingClientRect()
        return { centerDelta: Math.abs(star.y+star.height/2-score.y-score.height/2), gap: score.x-star.right }
      })
      assert.ok(starGeometry.centerDelta < 1 && starGeometry.gap >= 6 && starGeometry.gap <= 12)
      assert.equal(await form.locator('.rv-stars svg path').first().getAttribute('d'),await card.locator('.metric-star path').getAttribute('d'))
      for (const selector of ['.rv-stars label','.rv-stars input','.rv-wait input','.rv-wait-ticks button']) {
        assert.equal(await form.locator(selector).first().evaluate(el=>getComputedStyle(el).webkitTapHighlightColor),'rgba(0, 0, 0, 0)')
      }
      const wait = form.getByRole('slider',{name:'대기시간',exact:true})
      assert.equal(await wait.inputValue(),'0','waiting time is always visible and defaults to zero')
      const box = await wait.boundingBox()
      if (width < 600) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
      else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      assert.equal(await wait.inputValue(), '30', 'first touch at midpoint selects 30 without another tap')
      for (const minute of [0,10,20,30,40,50,60]) {
        await form.getByRole('button',{name:minute===60?'대기 1시간 이상':`대기 ${minute}분`,exact:true})[width < 600 ? 'tap' : 'click']()
        assert.equal(await wait.inputValue(),String(minute))
      }
      await form.getByRole('button',{name:'대기 30분',exact:true}).click()
      const tick = await form.getByRole('button',{name:'대기 30분',exact:true}).boundingBox()
      assert.ok(Math.abs(tick.x + tick.width / 2 - box.x - box.width / 2) < 1, '30 minute label is centered on slider')
      assert.equal(await wait.inputValue(),'30')
      assert.equal((await form.boundingBox()).y,topBefore.y,'rating/wait selections do not recenter dialog')
      assert.equal(await form.locator('.rv-integrated-notice').count(),0)
      await form.locator('textarea').fill('실제 카드에 연결한 프리뷰 시험입니다.')
      await form.locator('.rv-dialog-body').evaluate(el=>{el.scrollTop=0})
      await page.screenshot({path:path.join(output,`map-review-form-${width}.png`)})
      await page.evaluate(()=>{window.reviewTestFix.accuracy=100})
      await form.getByRole('button',{name:'리뷰 남기기',exact:true}).click()
      await form.getByRole('alert').filter({hasText:'50m'}).waitFor()
      assert.equal(await form.getByRole('radio',{name:'만족도 4점'}).isChecked(),true,'save eligibility failure retains input')
      await page.evaluate(()=>{window.reviewTestFix.accuracy=10;window.reviewTestFix.hold=true})
      await form.getByRole('button',{name:'위치 새로고침',exact:true}).click()
      await page.waitForFunction(()=>typeof window.reviewReleaseGeo==='function')
      assert.equal(await form.locator('textarea').inputValue(),'실제 카드에 연결한 프리뷰 시험입니다.','later verification retains the existing draft')
      assert.equal(await form.getByRole('radio',{name:'만족도 4점'}).isChecked(),true)
      assert.equal(await form.getByRole('button',{name:'리뷰 남기기',exact:true}).isDisabled(),true)
      await page.evaluate(()=>{window.reviewReleaseGeo();window.reviewTestFix.hold=false;delete window.reviewReleaseGeo})
      await page.waitForFunction(()=>document.querySelector('.rv-dialog-footer .rv-primary')?.disabled===false)
      await form.getByRole('button',{name:'리뷰 남기기',exact:true}).click()
      await page.getByRole('button',{name:'지도로 돌아가기',exact:true}).click()
      assert.equal(page.url(),url,'review does not navigate the map')
      assert.equal(await card.locator('.distance-value').innerText(),before,'reference distance is retained')
      assert.match(await card.locator('.toilet-community-row').innerText(),/4\s*\/\s*5/)
      // A review already written here routes straight to its owned detail, even when GPS is unavailable.
      const duplicateGeoCalls = await page.evaluate(()=>window.reviewTestGeoCalls)
      await page.evaluate(()=>{window.reviewTestFix.denied=true})
      await card.getByRole('button',{name:'리뷰',exact:true}).click()
      const existing = page.getByRole('region',{name:'내 리뷰 목록',exact:true})
      await existing.getByRole('status').filter({hasText:'작성한 리뷰 내역이 있습니다'}).waitFor()
      await existing.locator('.rv-full-comment').waitFor()
      assert.equal(await existing.locator('.history-review-summary').getAttribute('aria-expanded'),'true')
      assert.equal(await page.evaluate(()=>window.reviewTestGeoCalls),duplicateGeoCalls,'existing review never asks for location again')
      assert.equal(await page.getByRole('dialog',{name:'리뷰 쓰기',exact:true}).count(),0)
      await page.screenshot({path:path.join(output,`review-existing-${width}.png`)})
      if(width<600) { await existing.getByRole('button',{name:'내 리뷰 닫기'}).click(); await page.getByRole('navigation',{name:'하단 내비게이션'}).getByRole('button',{name:'지도',exact:true}).click() }
      else await page.getByRole('dialog',{name:'내 리뷰',exact:true}).getByRole('button',{name:'닫기',exact:true}).click()
      await page.evaluate(()=>{window.reviewTestFix.denied=false})
      if(width<600) await page.getByRole('navigation',{name:'하단 내비게이션'}).getByRole('button',{name:'내 페이지',exact:true}).click()
      else await page.getByRole('button',{name:'전체 메뉴',exact:true}).click()
      await page.getByRole('button',{name:'내 리뷰',exact:true}).click()
      const myReviews = page.getByRole('region',{name:'내 리뷰 목록',exact:true})
      await myReviews.locator('.rv-my-stars').waitFor()
      assert.match(await myReviews.locator('.rv-my-stars').innerText(),/★ 4\.5 \/ 5/)
      assert.doesNotMatch(await myReviews.locator('.history-review-summary').innerText(),/청결/)
      await page.screenshot({path:path.join(output,`my-review-average-${width}.png`)})
      await myReviews.getByRole('button',{name:new RegExp(name)}).click()
      assert.equal(await myReviews.locator('.rv-full-review dl>div').filter({hasText:'만족도'}).locator('dd').innerText(),'★ 4 / 5')
      assert.equal(await myReviews.locator('.rv-full-review dl>div').filter({hasText:'청결도'}).locator('dd').innerText(),'★ 5 / 5')
      if(width<600) assert.equal(await page.getByRole('dialog',{name:'내 리뷰',exact:true}).count(),0,'mobile history stays inside the page shell')
      assert.equal(await page.locator('.rv-full-review dl>div').filter({hasText:'대기시간'}).locator('dd').innerText(),'30분')
      await page.getByRole('button',{name:'수정하기',exact:true}).click()
      assert.equal(await page.getByRole('slider',{name:'대기시간'}).inputValue(),'30')
      await page.getByRole('button',{name:'대기 0분',exact:true}).click()
      await page.getByRole('dialog',{name:'리뷰 수정',exact:true}).locator('textarea').fill('수정된 프리뷰 시험 내용입니다.')
      await page.getByRole('button',{name:'수정한 내용 저장',exact:true}).click()
      await page.getByRole('button',{name:'내 리뷰 보기',exact:true}).click()
      const updatedCard = myReviews.getByRole('button',{name:new RegExp(name)})
      if(await updatedCard.getAttribute('aria-expanded') !== 'true') await updatedCard.click()
      assert.equal(await page.locator('.rv-full-review dl>div').filter({hasText:'대기시간'}).locator('dd').innerText(),'0분')
      await page.getByRole('button',{name:'작성자 정보 지우기',exact:true}).click()
      assert.match(await myReviews.locator('.history-remove-confirm').innerText(),/이 리뷰의 작성자 이름만 ‘익명’/)
      assert.match(await myReviews.locator('.history-remove-confirm').innerText(),/작성한 글은 삭제되지 않아요/)
      await page.getByRole('button',{name:'정보 지우기',exact:true}).click()
      await page.getByText('이 기간에 남긴 리뷰가 없어요',{exact:true}).waitFor()
      if(width<600) await myReviews.getByRole('button',{name:'내 리뷰 닫기'}).click()
      else await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click()
      if(width<600) await page.getByRole('navigation',{name:'하단 내비게이션'}).getByRole('button',{name:'지도',exact:true}).click()
      await card.getByRole('button',{name:'리뷰',exact:true}).click()
      await page.locator('.review-entry-hint').filter({hasText:'24시간'}).waitFor()
      assert.equal(await page.getByRole('dialog').count(),0,'unlinked review cannot be reopened as owned or bypass the daily limit')
      if(width<600) {
        await page.getByRole('navigation',{name:'하단 내비게이션'}).getByRole('button',{name:'지도',exact:true}).click()
        await page.locator('.mobile-area-list-button').click()
        await page.locator('.mobile-area-list-item').filter({has:page.locator('.mobile-area-list-additional')}).first().click()
      } else await page.locator('.desktop-area-list-item').filter({has:page.locator('.desktop-area-list-additional')}).first().click()
      const group = page.locator('.coordinate-group-card')
      await group.locator('.coordinate-group-item-toggle').first().click()
      const expanded = group.locator('.coordinate-group-item.is-expanded')
      await expanded.getByRole('button',{name:'리뷰',exact:true}).waitFor()
      assert.equal(await expanded.locator('.review-group-title-row').getByRole('button',{name:'정보 제공하기'}).count(),1)
      const groupName = await expanded.locator('.coordinate-group-name').innerText()
      await page.waitForURL(url=>/\/toilet\/\d+$/.test(url.pathname) && !url.pathname.endsWith('/13144'))
      const groupId = new URL(page.url()).pathname.split('/').at(-1)
      const groupDetail = details.get(groupName) || await (await context.request.get('https://api.geupddong.com/api/v1/toilets/'+groupId)).json()
      assert.ok(groupDetail && Number.isFinite(groupDetail.latitude), 'public group detail supplies test-only GPS fixture')
      await page.evaluate(point=>Object.assign(window.reviewTestFix, point),{latitude:groupDetail.latitude,longitude:groupDetail.longitude})
      await page.screenshot({path:path.join(output,`map-review-group-${width}.png`)})
      await expanded.getByRole('button',{name:'리뷰',exact:true}).click()
      await page.getByRole('dialog',{name:'리뷰 쓰기',exact:true}).getByRole('heading',{name:groupName,exact:true}).waitFor()
      await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click()
      for (const [change, expected] of [[{accuracy:51},'150m 이내'],[{accuracy:10,age:300001},'5분'],[{age:0,latitude:0},'150m 이내'],[{latitude:groupDetail.latitude,denied:true},'위치 권한']]) {
        await page.evaluate(value=>Object.assign(window.reviewTestFix,value),change)
        await expanded.locator('.review-entry').click()
        const toast = page.locator('.review-entry-hint').filter({hasText:expected})
        await toast.waitFor()
        assert.equal(await toast.evaluate(el=>{const r=el.getBoundingClientRect();el.style.pointerEvents='auto';const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;el.style.pointerEvents='';return hit}),true,'toast is not hidden behind the group card')
        assert.equal(await page.getByRole('dialog').count(),0,'failed entry checks never open a modal')
        const retry = expanded.locator('.review-entry')
        assert.equal(await retry.getAttribute('aria-label'), expected==='150m 이내'?'리뷰':'리뷰 위치 새로고침')
        if(expected==='150m 이내') {
          const line = await toast.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return {width:range.getBoundingClientRect().width,height:range.getBoundingClientRect().height,available:el.clientWidth-28,lineHeight:parseFloat(getComputedStyle(el).lineHeight)}})
          assert.ok(line.width<=line.available+1 && line.height<=line.lineHeight+1,'distance toast fits one line')
          await page.screenshot({path:path.join(output,`map-review-distance-${width}.png`)})
        }
        if(expected==='위치 권한') {
          await page.screenshot({path:path.join(output,`map-review-retry-${width}.png`)})
          await page.evaluate(()=>{window.reviewTestFix.denied=false;window.reviewTestFix.hold=true})
          await retry.click()
          await page.waitForFunction(()=>typeof window.reviewReleaseGeo==='function')
          assert.equal(await retry.isDisabled(),true)
          assert.equal(await page.getByRole('dialog').count(),0)
          await page.evaluate(()=>{window.reviewReleaseGeo();window.reviewTestFix.hold=false;delete window.reviewReleaseGeo})
          await page.waitForFunction(()=>document.querySelector('.rv-dialog-footer .rv-primary')?.disabled===false)
          assert.equal(await page.evaluate(()=>window.reviewTestGeoOptions.maximumAge),0,'retry bypasses an inaccurate cached fix')
          await page.getByRole('dialog',{name:'리뷰 쓰기',exact:true}).getByRole('button',{name:'닫기',exact:true}).click()
        }
      }
      // Closing a card invalidates both completions; a late auth response
      // must not reopen login or the review dialog.
      authHold = new Promise(resolve => { releaseAuth = resolve })
      await page.evaluate(()=>{window.reviewTestFix.hold=true})
      await expanded.getByRole('button',{name:'리뷰',exact:true}).click()
      await page.waitForFunction(()=>typeof window.reviewReleaseGeo==='function')
      await group.locator('.coordinate-group-item-toggle').first().click()
      const authCompleted = page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/me')
      signedIn = false
      releaseAuth(); authHold=null
      await page.evaluate(()=>{window.reviewReleaseGeo();window.reviewTestFix.hold=false;delete window.reviewReleaseGeo})
      await authCompleted
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
      assert.equal(await page.getByRole('dialog').count(),0,'closed form stays closed after late checks')
      signedIn = false
      await group.locator('.coordinate-group-item-toggle').first().click()
      await expanded.getByRole('button',{name:'리뷰',exact:true}).click()
      await page.getByRole('dialog',{name:'로그인 · 간편가입',exact:true}).waitFor()
      await page.getByRole('button',{name:'로그인 창 닫기',exact:true}).click()
      const geoCalls = await page.evaluate(()=>window.reviewTestGeoCalls)
      await expanded.getByRole('button',{name:'리뷰',exact:true}).click()
      await page.getByRole('dialog',{name:'로그인 · 간편가입',exact:true}).waitFor()
      assert.equal(await page.evaluate(()=>window.reviewTestGeoCalls),geoCalls,'signed-out review never requests GPS')
      await page.getByRole('button',{name:'로그인 창 닫기',exact:true}).click()
      signedIn = true
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' })
        Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' })
        Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 })
      })
      const desktopGeoCalls = await page.evaluate(()=>window.reviewTestGeoCalls)
      await expanded.getByRole('button',{name:'리뷰',exact:true}).click()
      await page.locator('.review-entry-hint').filter({hasText:'리뷰는 모바일에서 작성할 수 있어요.'}).waitFor()
      assert.equal(await page.getByRole('dialog').count(),0,'desktop review entry only shows the mobile guidance')
      assert.equal(await page.evaluate(()=>window.reviewTestGeoCalls),desktopGeoCalls,'desktop review entry never requests GPS')
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow')
      assert.equal(businessWrites,0)
      assert.deepEqual(errors,[])
      await context.close()
      console.log(`PASS actual map ${width}; button check visible ${openMs}ms; 4-minute fix accepted and older than 5 minutes rejected; inputs only after auth+GPS; blue/red paper; later retry retains draft; create/edit/detach; no business writes`)
    }
  } finally { await browser.close() }
})().catch(e=>{console.error(e);process.exitCode=1})
