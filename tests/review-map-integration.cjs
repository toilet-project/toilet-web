// Existing map UI, not the standalone review page. Real public toilet reads only;
// identities are fixtures and all business writes are blocked.
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright')
const origin = process.env.REVIEW_PREVIEW_ORIGIN || 'http://127.0.0.1:4187'
assert.ok(['http://127.0.0.1:4187', 'https://preview.geupddong.com'].includes(origin))
const output = process.env.REVIEW_SCREENSHOT_DIR || path.resolve('.tmp-review-screenshots')
fs.mkdirSync(output, { recursive: true })
const local = origin.includes('127.0.0.1')
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const width of [390, 320, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: width > 600 ? 1000 : 844 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: 'block' })
      let businessWrites = 0
      const errors = []
      await context.route('**/*', async route => {
        const req = route.request(), u = new URL(req.url())
        if (u.pathname === '/api/v1/auth/me') return route.fulfill({ json: { userId: 'review-map-fixture', displayName: '리뷰 검증 사용자', status: 'ACTIVE', roles: ['USER'], consentRequired: false } })
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
      page.on('pageerror',e=>errors.push(e.message))
      await page.goto(origin+'/toilet/13144', { waitUntil:'networkidle' })
      if (local) await page.addStyleTag({ content: 'nextjs-portal { pointer-events: none!important; }' })
      await page.locator('.app-shell[data-review-design-preview=true]').waitFor()
      const card = page.locator('.map-stage .place-card').first()
      await card.getByRole('button',{name:'리뷰',exact:true}).waitFor()
      const name = await card.locator('.place-card-summary h1').innerText()
      const before = await card.locator('.distance-value').innerText()
      const url = page.url()
      assert.equal(await card.locator('.review-card-title-row').getByRole('button',{name:'정보 제공하기'}).count(),1)
      await page.screenshot({path:path.join(output,`map-review-card-${width}.png`)})
      await card.getByRole('button',{name:'리뷰',exact:true}).click()
      const form = page.getByRole('dialog',{name:'리뷰 쓰기',exact:true})
      await form.getByRole('heading',{name,exact:true}).waitFor()
      await form.getByRole('radio',{name:'만족도 4점'}).check()
      await form.getByRole('radio',{name:'청결도 5점'}).check()
      await form.getByRole('button',{name:'있었어요',exact:true}).click()
      await form.locator('textarea').fill('실제 카드에 연결한 프리뷰 시험입니다.')
      await form.locator('.rv-dialog-body').evaluate(el=>{el.scrollTop=0})
      await page.screenshot({path:path.join(output,`map-review-form-${width}.png`)})
      await form.getByRole('button',{name:'리뷰 남기기',exact:true}).click()
      await page.getByRole('button',{name:'카드로 돌아가기',exact:true}).click()
      assert.equal(page.url(),url,'review does not navigate the map')
      assert.equal(await card.locator('.distance-value').innerText(),before,'reference distance is retained')
      assert.match(await card.locator('.toilet-community-row').innerText(),/4\.0/)
      if(width<600) await page.getByRole('navigation',{name:'하단 내비게이션'}).getByRole('button',{name:'내 페이지',exact:true}).click()
      else await page.getByRole('button',{name:'전체 메뉴',exact:true}).click()
      await page.getByRole('button',{name:'내 리뷰',exact:true}).click()
      await page.getByRole('dialog',{name:'내 리뷰',exact:true}).getByRole('button',{name:new RegExp(name)}).click()
      await page.getByRole('button',{name:'수정하기',exact:true}).click()
      await page.getByRole('dialog',{name:'리뷰 수정',exact:true}).locator('textarea').fill('수정된 프리뷰 시험 내용입니다.')
      await page.getByRole('button',{name:'수정한 내용 저장',exact:true}).click()
      await page.getByRole('button',{name:'내 리뷰 보기',exact:true}).click()
      await page.getByRole('dialog',{name:'내 리뷰',exact:true}).getByRole('button',{name:new RegExp(name)}).click()
      await page.getByRole('button',{name:'작성자 정보 지우기',exact:true}).click()
      await page.getByRole('button',{name:'정보 지우기',exact:true}).click()
      await page.getByRole('heading',{name:'아직 남긴 리뷰가 없어요'}).waitFor()
      await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click()
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
      await page.screenshot({path:path.join(output,`map-review-group-${width}.png`)})
      await expanded.getByRole('button',{name:'리뷰',exact:true}).click()
      await page.getByRole('dialog',{name:'리뷰 쓰기',exact:true}).getByRole('heading',{name:groupName,exact:true}).waitFor()
      await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click()
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow')
      assert.equal(businessWrites,0)
      assert.deepEqual(errors,[])
      await context.close()
      console.log(`PASS existing map/card/profile integration ${width}; create/edit/detach; no navigation/reference changes or business writes`)
    }
  } finally { await browser.close() }
})().catch(e=>{console.error(e);process.exitCode=1})
