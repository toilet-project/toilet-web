// A preview-only synthetic point. No business writes or actual GPS data.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright')
const origin = process.env.REVIEW_PREVIEW_ORIGIN || 'http://127.0.0.1:4187'
assert.ok(['http://127.0.0.1:4187', 'https://preview.geupddong.com'].includes(origin))
;(async () => {
 const browser = await chromium.launch({ channel: 'chrome', headless: true })
 try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
  let writes = 0
  await context.route('**/*', async route => {
   const req = route.request(), url = new URL(req.url())
   if (url.pathname === '/cdn-cgi/rum') return route.fulfill({ status: 204 })
   if (!['GET','HEAD','OPTIONS'].includes(req.method())) { writes++; return route.abort() }
   if (url.pathname === '/api/v1/auth/me') return route.fulfill({ json: null })
   if (url.pathname === '/api/v1/toilets') return route.fulfill({ json: { meta: { map_level: 4, display_type: 'MARKER', total_count: 0, result_count: 0 }, toilets: [], clusters: [] } })
   if (origin.includes('127.0.0.1') && url.hostname === 'dapi.kakao.com') return route.abort()
   return route.continue()
  })
  if (origin.includes('127.0.0.1')) await context.addInitScript(() => {
   document.addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = 'nextjs-portal {display:none!important}'; document.head.append(style) })
   class LatLng { constructor(lat,lng){this.lat=lat;this.lng=lng}getLat(){return this.lat}getLng(){return this.lng} }
   class MapMock {
    constructor(el,options){this.el=el;this.center=options.center;this.level=options.level;this.listeners={};el.addEventListener('touchmove',event=>event.preventDefault(),{passive:false})}
    getCenter(){return this.center}getLevel(){return this.level}getBounds(){return {getSouthWest:()=>new LatLng(36.3,127.3),getNorthEast:()=>new LatLng(36.4,127.4)}}getProjection(){return {pointFromCoords:()=>({x:150,y:200})}}relayout(){}panTo(p){this.center=p}setCenter(p){this.center=p}setDraggable(){}setZoomable(){}setLevel(v){this.level=v}
   }
   class Overlay {constructor(options){this.options=options}setMap(map){this.options.content.remove();if(map){Object.assign(this.options.content.style,{position:'absolute',left:'150px',top:'200px'});map.el.append(this.options.content)}}}
   window.kakao={maps:{Map:MapMock,LatLng,CustomOverlay:Overlay,event:{preventMap(){},addListener(map,name,fn){(map.listeners[name]??=[]).push(fn)}},services:{Status:{OK:'OK',ZERO_RESULT:'ZERO'}}}}
  })
  const page = await context.newPage(), errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(origin+'/#review-test=36.3663520,127.3149258', { waitUntil: 'networkidle' })
  const marker = page.locator('.review-test-marker')
  await marker.waitFor()
  if (await page.locator('.place-card').count()) await page.getByRole('button', { name: '정보 닫기', exact: true }).click()
  await page.evaluate(() => {
   window.markerEventProbe = { down: 0, move: 0 }
   const map = document.querySelector('.map')
   map.addEventListener('pointerdown', () => window.markerEventProbe.down++)
   map.addEventListener('touchmove', () => window.markerEventProbe.move++)
  })
  const session = await context.newCDPSession(page)
  const before = await marker.boundingBox(), x = before.x + before.width/2, y = before.y + before.height/2
  const touch = (type, points) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x,y,id=1])=>({x,y,id,radiusX:2,radiusY:2,force:1})) })
  await touch('touchStart', [[x,y]])
  for(let i=1;i<=8;i++){await touch('touchMove',[[x+i*10,y+i*2]]);await page.waitForTimeout(30)}
  await touch('touchEnd', [])
  await page.waitForTimeout(500)
  assert.equal(await page.locator('.place-card').count(), 0, 'drag beginning on a marker never opens details')
  const probe = await page.evaluate(() => window.markerEventProbe)
  assert.ok(probe.down > 0 && probe.move > 0, 'original gestures reach the map instead of stopping at the marker')
  if (!origin.includes('127.0.0.1')) {
   const after = await marker.boundingBox()
   assert.ok(Math.hypot(after.x-before.x,after.y-before.y) > 40, 'real Kakao map pans when dragging from the marker')
  }
  await marker.tap()
  await page.locator('.place-card h1').filter({ hasText: '리뷰 테스트 화장실' }).waitFor()
  await page.getByRole('button', { name: '정보 닫기', exact: true }).click()
  await marker.focus(); await page.keyboard.press('Enter')
  await page.locator('.place-card h1').filter({ hasText: '리뷰 테스트 화장실' }).waitFor()
  assert.equal(writes, 0); assert.deepEqual(errors, [])
  console.log(`PASS marker drag: ${origin.includes('127.0.0.1') ? 'original gesture propagation' : 'real Kakao map movement'}, no drag selection, tap/keyboard selection, no business writes`)
  await context.close()
 } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
