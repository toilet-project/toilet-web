// Synthetic owner, reports, clock and GPS; no business writes leave this browser.
const assert = require('node:assert/strict')
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
  for(const width of [390,320]) {
   const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'})
   let owner='history-owner', nextOwner='history-owner', reportMode='', reads=0, writes=0
   const reports=Array.from({length:25},(_,i)=>({id:i+1,toiletId:13144,toiletName:`목록 시험 ${String(i+1).padStart(2,'0')}`,reportType:'COORDINATE_CORRECTION',reason:'합성 제보 내용',roadAddress:'공개 시험 주소',status:i%2?'APPROVED':'PENDING',createdAt:new Date(now-i*1000).toISOString()}))
   reports.push({ ...reports[0],id:40,toiletName:'10일 전 시험',createdAt:iso(10) },{...reports[0],id:41,toiletName:'40일 전 시험',createdAt:iso(40)})
   await context.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url())
    if(u.pathname==='/api/v1/auth/me')return route.fulfill({json:owner?{userId:owner,displayName:'시험 사용자',status:'ACTIVE',roles:['USER'],consentRequired:false}:null})
    if(u.pathname.startsWith('/api/v1/auth/login/')) {owner=nextOwner;reportMode='';return route.fulfill({contentType:'text/html',body:`<script>location.replace('${origin}/?login=success#review-test=36.3504,127.3845')</script>`})}
    if(u.pathname==='/api/v1/auth/refresh')return route.fulfill({status:401,json:{}})
    if(u.pathname==='/api/v1/notifications/unread-count')return route.fulfill({json:{count:0}})
    if(u.pathname==='/api/v1/notifications')return route.fulfill({json:{items:[{id:1,type:'REPORT_APPROVED',referenceType:'TOILET_REPORT',referenceId:41,title:'오래된 제보 확인',message:'읽음 상태의 합성 알림',read:true,createdAt:iso(0)}],page:0,size:20,totalElements:1,totalPages:1}})
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
   const original=page.url(), header=await page.locator('.topbar').elementHandle(), navElement=await nav.elementHandle(), map=await page.locator('.map').elementHandle()
   const stable=async()=>{
    assert.equal(page.url(),original)
    for(const el of [header,navElement,map])assert.equal(await el.evaluate(el=>el.isConnected),true,'shell/map should not remount')
    const bounds=await shell.boundingBox(),top=await page.locator('.topbar').boundingBox(),bottom=await nav.boundingBox()
    assert.ok(bounds.y>=top.y+top.height-1 && bounds.y+bounds.height<=bottom.y+1,'history inside header/nav')
    assert.equal(await shell.evaluate(el=>el.scrollWidth>el.clientWidth),false,'no horizontal overflow')
   }
   const showReports=async()=>{await nav.getByRole('button',{name:'내 페이지',exact:true}).click();await shell.getByRole('button',{name:'내 제보',exact:true}).click()}
   await showReports();await shell.locator('.my-report-item').first().waitFor()
   assert.equal(await page.getByRole('dialog').count(),0)
   assert.equal(await shell.locator('.my-report-item').count(),10)
   assert.equal(await shell.getByRole('button',{name:'최근 7일',exact:true}).getAttribute('aria-pressed'),'true')
   assert.match(await shell.locator('.my-report-item').first().innerText(),/목록 시험 01/)
   await stable();await page.screenshot({path:path.join(output,`reports-history-${width}.png`)})
   const initialReads=reads // Development Strict Mode can repeat the initial read.
   await shell.evaluate(el=>{el.scrollTop=el.scrollHeight});await page.waitForFunction(()=>document.querySelectorAll('.mobile-page .my-report-item').length===20)
   await shell.evaluate(el=>{el.scrollTop=el.scrollHeight});await page.waitForFunction(()=>document.querySelectorAll('.mobile-page .my-report-item').length===25)
   assert.equal(reads,initialReads,'client append must not refetch the whole report array')
   await shell.getByRole('button',{name:'최근 30일',exact:true}).click()
   assert.match(await shell.locator('.history-range-caption').innerText(),/26개/)
   assert.equal(await shell.locator('.my-report-item').count(),10)
   await shell.getByRole('group',{name:'조회 기간'}).getByRole('button',{name:'전체',exact:true}).click()
   assert.match(await shell.locator('.history-range-caption').innerText(),/27개/)
   await shell.getByRole('button',{name:'날짜 직접 선택'}).click()
   await shell.getByLabel('시작일',{exact:true}).fill('2026-08-02');await shell.getByLabel('종료일',{exact:true}).fill('2026-08-02')
   await page.screenshot({path:path.join(output,`history-date-picker-${width}.png`)})
   await shell.getByRole('button',{name:'적용하기'}).click()
   assert.equal(await shell.locator('.my-report-item').count(),1)
   await shell.getByRole('button',{name:/40일 전 시험/}).click();await shell.getByText('합성 제보 내용',{exact:true}).waitFor();await stable()
   await shell.getByRole('button',{name:'날짜 직접 선택'}).click();await shell.getByLabel('시작일',{exact:true}).fill('2026-09-10');await shell.getByLabel('종료일',{exact:true}).fill('2026-09-01');await shell.getByRole('button',{name:'적용하기'}).click();await shell.getByRole('alert').filter({hasText:'종료일'}).waitFor();assert.equal(await shell.locator('.my-report-item').count(),1);await shell.getByRole('button',{name:'취소',exact:true}).click()
   await shell.getByRole('button',{name:'최근 7일',exact:true}).click();await shell.getByRole('navigation',{name:'제보 상태 필터'}).getByRole('button',{name:/승인/}).click();assert.match(await shell.locator('.history-range-caption').innerText(),/12개/)
   await shell.getByRole('button',{name:'내 페이지로 돌아가기'}).click();await shell.getByRole('heading',{name:'내 페이지',exact:true}).waitFor()
   // Notification targets outside the default date/window still open in this shell.
   await nav.getByRole('button',{name:/^알림/}).click();await shell.getByRole('button',{name:/받은 알림/}).click()
   await page.getByRole('dialog',{name:'알림',exact:true}).getByRole('button',{name:/오래된 제보 확인/}).click()
   await shell.getByText('합성 제보 내용',{exact:true}).waitFor()
   assert.equal(await shell.getByRole('group',{name:'조회 기간'}).getByRole('button',{name:'전체',exact:true}).getAttribute('aria-pressed'),'true')
   assert.equal(await shell.locator('.my-report-item').count(),27)
   await stable()
   // Create actual memory-only reviews through the UI, never inject review state.
   const reviewCount=width===390?13:1
   for(let i=0;i<reviewCount;i++) {
    await nav.getByRole('button',{name:'지도',exact:true}).click()
    await page.evaluate(time=>{window.historyTestNow=time},now-i*1000)
    await page.locator('.map-stage .place-card').getByRole('button',{name:'리뷰',exact:true}).click()
    const form=page.getByRole('dialog',{name:'리뷰 쓰기',exact:true})
    await form.getByRole('radio',{name:'만족도 4점'}).check();await form.getByRole('radio',{name:'청결도 5점'}).check();await form.getByRole('button',{name:'있었어요',exact:true}).click();await form.locator('textarea').fill(`리뷰 목록 시험 ${String(i+1).padStart(2,'0')}`);await form.getByRole('button',{name:'리뷰 남기기',exact:true}).click();await page.getByRole('button',{name:'카드로 돌아가기',exact:true}).click()
   }
   await page.evaluate(time=>{window.historyTestNow=time},now)
   await nav.getByRole('button',{name:'내 페이지',exact:true}).click();await shell.getByRole('button',{name:'내 리뷰',exact:true}).click()
   await shell.locator('.history-card').first().waitFor()
   assert.equal(await page.getByRole('dialog').count(),0)
   assert.equal(await shell.locator('.history-card').count(),Math.min(10,reviewCount))
   assert.match(await shell.locator('.history-card').first().innerText(),/리뷰 목록 시험 01/)
   await stable();await page.screenshot({path:path.join(output,`reviews-history-${width}.png`)})
   if(width===390){await shell.evaluate(el=>{el.scrollTop=el.scrollHeight});await page.waitForFunction(()=>document.querySelectorAll('.mobile-page .history-card').length===13)}
   await shell.locator('.history-card').first().getByRole('button').click();await shell.locator('.rv-full-comment').waitFor();await stable()
   await page.screenshot({path:path.join(output,`reviews-expanded-${width}.png`)})
   await shell.getByRole('button',{name:'수정하기',exact:true}).click();await page.getByRole('dialog',{name:'리뷰 수정'}).locator('textarea').fill('수정 후에도 내 목록 안에 있어요');await page.getByRole('button',{name:'수정한 내용 저장'}).click();await page.getByRole('button',{name:'목록으로 돌아가기'}).click();await shell.getByText('수정 후에도 내 목록 안에 있어요',{exact:true}).first().waitFor();assert.equal(await page.getByRole('dialog').count(),0)
   await shell.getByRole('button',{name:'날짜 직접 선택'}).click();await shell.getByLabel('시작일',{exact:true}).fill('2026-08-02');await shell.getByLabel('종료일',{exact:true}).fill('2026-08-02');await shell.getByRole('button',{name:'적용하기'}).click();await shell.getByText('이 기간에 남긴 리뷰가 없어요',{exact:true}).waitFor()
   await shell.getByRole('button',{name:'최근 7일',exact:true}).click();assert.equal(await shell.locator('.history-card').count(),Math.min(10,reviewCount))
   // Offline recovery and expiration clear private embedded contents.
   reportMode='offline';await showReports();await shell.getByRole('alert').filter({hasText:'인터넷'}).waitFor();reportMode='';await shell.getByRole('button',{name:'다시 불러오기'}).click();await shell.locator('.my-report-item').first().waitFor()
   reportMode='401';await showReports();await shell.getByRole('heading',{name:'로그인 · 간편가입',exact:true}).waitFor();assert.equal(await shell.locator('.my-report-item,.history-card').count(),0)
   await shell.getByRole('button',{name:'Google로 계속하기'}).click();await shell.locator('.my-report-item').first().waitFor()
   assert.equal(await shell.getByRole('button',{name:'최근 7일',exact:true}).getAttribute('aria-pressed'),'true')
   assert.equal(await page.getByRole('dialog').count(),0,'OAuth resumes embedded report history')
   reportMode='401';await showReports();await shell.getByRole('heading',{name:'로그인 · 간편가입',exact:true}).waitFor()
   nextOwner='another-history-owner';await shell.getByRole('button',{name:'Google로 계속하기'}).click();await shell.getByText('이 기간에 표시할 제보가 없어요',{exact:true}).waitFor()
   assert.equal(await shell.locator('.my-report-item,.history-card').count(),0,'previous owner records cleared')
   assert.equal(writes,0);assert.deepEqual(errors,[])
   console.log(`PASS history ${width}: embedded reports/reviews, 7/30/all/custom, sorted, 10-item auto append, inline detail/edit return, offline retry, expiry, stable shell; reads=${reads}; no business writes`)
   await context.close()
  }
 } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
