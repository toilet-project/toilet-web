// Synthetic owner, reports, clock and GPS; no business writes leave this browser.
const assert = require('node:assert/strict')
const { selectCalendarDate } = require('./history-calendar-browser.cjs')
const fs = require('node:fs'), path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright')
const origin = process.env.REVIEW_PREVIEW_ORIGIN || 'http://127.0.0.1:4187'
assert.ok(['http://127.0.0.1:4187','https://preview.geupddong.com'].includes(origin))
const output = process.env.REVIEW_SCREENSHOT_DIR || path.resolve('.tmp-history-screenshots')
fs.mkdirSync(output,{recursive:true})
const now = Date.parse('2026-09-11T12:00:00+09:00'), day = 86400000
const iso = age => new Date(now-age*day).toISOString()
;(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try {
  for(const width of [390,320,1280]) {
   const context=await browser.newContext({viewport:{width,height:844},isMobile:width<600,hasTouch:width<600,serviceWorkers:'block'})
   let owner='history-owner', nextOwner='history-owner', reportMode='', reads=0, writes=0
   let mode='', allRead=false;const pages=[]
   const inbox=Array.from({length:45},(_,i)=>({id:i+1,type:'REPORT_APPROVED',referenceType:'NOTICE',referenceId:0,title:`알림 시험 ${String(i+1).padStart(2,'0')}`,message:'제보 처리 결과를 확인해 주세요.',read:false,createdAt:new Date(now-(i<25?0:i<35?10:40)*day-i*1000).toISOString()}))
   const reports=Array.from({length:25},(_,i)=>({id:i+1,toiletId:13144,toiletName:`목록 시험 ${String(i+1).padStart(2,'0')}`,reportType:'COORDINATE_CORRECTION',reason:'합성 제보 내용',roadAddress:'공개 시험 주소',status:i%2?'APPROVED':'PENDING',createdAt:new Date(now-i*1000).toISOString()}))
   reports.push({ ...reports[0],id:40,toiletName:'10일 전 시험',createdAt:iso(10) },{...reports[0],id:41,toiletName:'40일 전 시험',createdAt:iso(40)})
   await context.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url())
    if(u.pathname==='/api/v1/auth/me')return route.fulfill({json:owner?{userId:owner,displayName:'시험 사용자',status:'ACTIVE',roles:['USER'],consentRequired:false}:null})
    if(u.pathname.startsWith('/api/v1/auth/login/')) {owner=nextOwner;reportMode='';return route.fulfill({contentType:'text/html',body:`<script>location.replace('${origin}/?login=success#review-test=36.3504,127.3845')</script>`})}
    if(u.pathname==='/api/v1/auth/refresh')return route.fulfill({status:401,json:{}})
    if(u.pathname==='/api/v1/notifications/unread-count')return route.fulfill({json:{count:allRead?0:45}})
    if(u.pathname==='/api/v1/notifications') {
     if(mode==='offline')return route.abort('internetdisconnected')
     const page=Number(u.searchParams.get('page'));pages.push(page)
     return route.fulfill({json:{items:inbox.slice(page*20,page*20+20).map(item=>({...item,read:allRead||item.read})),page,size:20,totalPages:3,totalElements:45}})
    }
    if(u.pathname==='/api/v1/notifications/read-all'){writes++;allRead=true;return route.fulfill({json:{}})}
    if(/\/notifications\/\d+\/read$/.test(u.pathname)){writes++;return route.fulfill({json:{}})}
    if(u.pathname==='/api/v1/reports/me') {
     reads++
     if(reportMode==='offline')return route.abort('internetdisconnected')
     if(reportMode==='401'){owner=null;return route.fulfill({status:401,json:{}})}
     return route.fulfill({json:owner==='history-owner'?[...reports].reverse():[]})
    }
    if(u.pathname==='/api/v1/toilets')return route.fulfill({json:{meta:{map_level:4,display_type:'MARKER',total_count:0,result_count:0},toilets:[],clusters:[]}})
    if(u.pathname==='/cdn-cgi/rum')return route.fulfill({status:204})
    if(!['GET','HEAD','OPTIONS'].includes(req.method())){writes++;return route.abort()}
    if(origin.includes('127.0.0.1')&&u.hostname==='dapi.kakao.com')return route.abort()
    return route.continue()
   })
   await context.addInitScript(fixed=>{
    const RealDate=Date;window.historyTestNow=fixed
    window.Date=class extends RealDate { constructor(...args){if(args.length)super(...args);else super(window.historyTestNow)} static now(){return window.historyTestNow} }
    Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){setTimeout(()=>ok({coords:{latitude:36.3504,longitude:127.3845,accuracy:10},timestamp:Date.now()}),10)},watchPosition(){return 1},clearWatch(){}}})
   },now)
   if(origin.includes('127.0.0.1'))await context.addInitScript(()=>{
    class LatLng {constructor(lat,lng){this.lat=lat;this.lng=lng}getLat(){return this.lat}getLng(){return this.lng}}
    class MapMock {constructor(el,options){this.el=el;this.center=options.center;this.level=options.level;this.listeners={}}getCenter(){return this.center}getLevel(){return this.level}getBounds(){return {getSouthWest:()=>new LatLng(36.34,127.37),getNorthEast:()=>new LatLng(36.36,127.39)}}getProjection(){return {pointFromCoords:()=>({x:180,y:300})}}relayout(){}panTo(p){this.center=p}setCenter(p){this.center=p}setDraggable(){}setZoomable(){}setLevel(v){this.level=v}}
    class Overlay {constructor(options){this.options=options}setMap(map){this.options.content.remove();if(map){Object.assign(this.options.content.style,{position:'absolute',left:'130px',top:'160px'});map.el.append(this.options.content)}}}
    window.kakao={maps:{Map:MapMock,LatLng,CustomOverlay:Overlay,event:{preventMap(){},addListener(map,name,fn){(map.listeners[name]??=[]).push(fn)}},services:{Status:{OK:'OK',ZERO_RESULT:'ZERO'}}}}
   })
   const page=await context.newPage(),errors=[]
   page.on('pageerror',e=>errors.push(e.message))
   await page.goto(origin+'/#review-test=36.3504,127.3845',{waitUntil:'networkidle'})
   if(origin.includes('127.0.0.1'))await page.addStyleTag({content:'nextjs-portal {pointer-events:none!important}'})
   await page.locator('.review-test-marker').waitFor()
   const nav=page.getByRole('navigation',{name:'하단 내비게이션'}), shell=page.locator('.mobile-page')
   const panel=width<600?page.getByRole('region',{name:'받은 알림 목록'}):page.getByRole('dialog',{name:'알림',exact:true})
   const scroll=width<600?shell:panel.locator('.notification-list')
   const open=async()=>{if(width<600)await nav.getByRole('button',{name:/^알림/}).click();else await page.locator('.notification-button').click()}
   const close=async()=>{if(width<600)await nav.getByRole('button',{name:'지도',exact:true}).click();else await panel.getByRole('button',{name:'알림 닫기'}).click()}
   const ready=async()=>{await panel.locator('.notification-list[aria-busy=false]').waitFor()}
   const count=async n=>page.waitForFunction(n=>document.querySelectorAll('.notification-item').length===n,n)
   const append=async n=>{await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight});await count(n)}
   await open();await ready();await count(10)
   assert.equal(await panel.locator('.history-heading p').count(),0,'notification heading has no subtitle or empty paragraph')
   assert.equal(await panel.getByRole('button',{name:'최근 7일',exact:true}).getAttribute('aria-pressed'),'true')
   assert.equal(reads,0,'notification navigation does not load report history')
   if(width<600){
    assert.equal(await page.getByRole('dialog').count(),0)
    const a=await shell.boundingBox(),c=await nav.boundingBox()
    assert.equal(await page.locator('.topbar').isVisible(),false,'notification page hides the map header')
    assert.equal(a.y,0,'notification page reclaims the old header space')
    assert.ok(a.y+a.height<=c.y+1)
    assert.equal(await shell.getByRole('combobox',{name:'알림 항목'}).count(),0)
   }
   await page.screenshot({path:path.join(output,`notifications-${width}.png`)})
   const calendarLayout=()=>panel.evaluate(el=>({listY:el.querySelector('.notification-list').getBoundingClientRect().top,actionsY:el.querySelector('.notification-history-actions').getBoundingClientRect().top,scrollHeight:el.closest('.mobile-page')?.scrollHeight??el.querySelector('.notification-list').clientHeight}))
   for(const height of [844,480]) {
    await page.setViewportSize({width,height})
    await scroll.evaluate(el=>{el.scrollTop=0})
    const closedCalendarLayout=await calendarLayout()
    const dateToggle=panel.getByRole('button',{name:'날짜 직접 선택'})
    await dateToggle.click()
    assert.deepEqual(await calendarLayout(),closedCalendarLayout,'opening the calendar never moves or shrinks the notification list and read-all row')
    const popover=panel.locator('.history-date-popover'), popup=await popover.boundingBox(), toggleBox=await dateToggle.boundingBox()
    const lowerEdge=width<600?(await nav.boundingBox()).y:(await panel.boundingBox()).y+(await panel.boundingBox()).height
    assert.ok(popup.y>=toggleBox.y+toggleBox.height+7,'date popup has a clear gap from the toggle')
    assert.ok(popup.y+popup.height<=lowerEdge-7,'calendar stays above navigation or inside the desktop panel')
    const applyBox=await panel.getByRole('button',{name:'적용',exact:true}).boundingBox()
    assert.equal(applyBox.width,64);assert.equal(applyBox.height,48)
    const calendarBox=await panel.locator('.history-calendar').boundingBox()
    assert.ok(calendarBox.height<=300,'five-week calendar is vertically compact')
    const dayBox=await panel.getByRole('button',{name:'2026년 9월 5일',exact:true}).boundingBox()
    assert.ok(dayBox.width>=34&&dayBox.height>=34,'date tap targets remain readable and usable')
    assert.equal(await panel.getByRole('button',{name:'2026년 9월 12일',exact:true}).isDisabled(),true)
    await page.screenshot({path:path.join(output,`notifications-calendar-${width}-${height}.png`)})
    await selectCalendarDate(panel,'시작일','2026-08-02')
    assert.equal(await panel.locator('.history-calendar-grid [role=row]').count(),7,'six-week months retain every date row')
    assert.ok((await panel.locator('.history-calendar').boundingBox()).height<=340,'six-week calendar remains compact')
    await popover.evaluate(el=>{el.scrollTop=el.scrollHeight})
    await page.waitForTimeout(50)
    assert.equal(await dateToggle.getAttribute('aria-expanded'),'true','inner calendar scrolling does not dismiss the calendar')
    assert.deepEqual(await calendarLayout(),closedCalendarLayout,'calendar scroll does not change the underlying list')
    await page.keyboard.press('Escape')
    assert.equal(await dateToggle.getAttribute('aria-expanded'),'false')
    assert.equal(await dateToggle.evaluate(el=>el===document.activeElement),true,'Escape returns focus to the date toggle')
    await dateToggle.click();await dateToggle.click()
    assert.equal(await dateToggle.getAttribute('aria-expanded'),'false','date toggle closes its popup')
    await dateToggle.click();await scroll.evaluate(el=>{el.scrollTop=20})
    await page.waitForFunction(()=>document.querySelector('.history-date-toggle').getAttribute('aria-expanded')==='false')
    await scroll.evaluate(el=>{el.scrollTop=0})
   }
   await page.setViewportSize({width,height:844})
   await append(20);await append(25);await ready()
   assert.match(await panel.locator('.history-range-caption').innerText(),/25개/)
   await panel.getByRole('button',{name:'최근 30일',exact:true}).click();await ready();await count(10)
   await append(20);await append(30);await append(35);await ready()
   assert.match(await panel.locator('.history-range-caption').innerText(),/35개/)
   await panel.getByRole('button',{name:'전체',exact:true}).click();await ready();await count(10)
   await append(20);await append(30);await append(40);await append(45);await ready()
   assert.match(await panel.locator('.history-range-caption').innerText(),/45개/)
   await panel.getByRole('button',{name:'날짜 직접 선택'}).click()
   await selectCalendarDate(panel,'시작일','2026-08-02');await selectCalendarDate(panel,'종료일','2026-08-02');await panel.getByRole('button',{name:'적용',exact:true}).click();await ready();await count(10)
   assert.match(await panel.locator('.notification-item').first().innerText(),/알림 시험 36/)
   assert.ok(pages.includes(2),'custom old date reaches API page 3')
   assert.equal(writes,0,'all filters and appends are read-only')
   await panel.getByRole('button',{name:'모두 읽음'}).click()
   await page.waitForFunction(()=>document.querySelectorAll('.notification-item.is-unread').length===0)
   assert.equal(writes,1);await close()
   assert.equal(await page.locator('.topbar').isVisible(),true,'map header returns when notifications close')
   mode='offline';await open();await panel.getByRole('alert').waitFor()
   mode='';await panel.getByRole('button',{name:'다시 불러오기'}).click();await ready();await count(10)
   await panel.getByRole('button',{name:'날짜 직접 선택'}).click()
   await selectCalendarDate(panel,'시작일','2026-07-01');await selectCalendarDate(panel,'종료일','2026-07-01');await panel.getByRole('button',{name:'적용',exact:true}).click();await ready()
   await panel.getByText('이 기간에 받은 알림이 없어요',{exact:true}).waitFor()
   assert.equal(await panel.evaluate(el=>el.scrollWidth>el.clientWidth),false)
   if(width>=600){await panel.getByRole('button',{name:'알림 닫기'}).focus();await page.keyboard.press('Shift+Tab');assert.ok(await panel.evaluate(el=>el.contains(document.activeElement)));await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});assert.equal(await page.locator('.notification-button').evaluate(el=>el===document.activeElement),true)}
   assert.deepEqual(errors,[]);console.log(`PASS inbox ${width}: direct shell/desktop modal, 7/30/all/custom, 10-item append through 3 API pages, read-all, offline retry, empty range, zero real mutations`)
   await context.close()
  }
 } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
