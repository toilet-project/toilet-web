// Opt-in local integration: real Spring HTTP + MySQL, never a deployed API.
// API transport is redirected to loopback only. The harness normalizes Origin/CORS for local dev;
// production origin denial is separately asserted below. Review/session responses
// are NOT mocked. The API test-classpath host supplies synthetic accounts and public facility metadata.
const assert = require('node:assert/strict')
const { selectCalendarDate, openHistoryFilters } = require('./history-calendar-browser.cjs')
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright')
const metadata = JSON.parse(fs.readFileSync(process.env.REVIEW_HTTP_METADATA, 'utf8'))
assert.match(metadata.marker, /^[a-f0-9]{10}$/)
assert.equal(path.basename(path.dirname(process.env.REVIEW_HTTP_METADATA)),`account-retention-mysql-${metadata.marker}`)
assert.ok(Number.isInteger(metadata.port) && metadata.port > 1024 && metadata.port !== 3306)
const api = `http://127.0.0.1:${metadata.port}`, web = 'http://127.0.0.1:4187'
const virtualWeb = web, trustedOrigin = 'https://preview.geupddong.com', virtualApi = 'https://api.geupddong.com'
const output = process.env.REVIEW_SCREENSHOT_DIR || path.resolve('.tmp-review-real-api')
const mobileUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
fs.mkdirSync(output, { recursive: true })
const body = () => ({ toiletId: 1, satisfaction: 4, cleanliness: 5, paper: true, waitMinutes: 20, comment: '합성 HTTP 검증', position: { latitude: 36.3, longitude: 127.3, accuracyMeters: 10, measuredAt: new Date().toISOString() } })
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    if(!process.argv.includes('--browser-only')) {
    const checks = await browser.newContext()
    const call = (owner, url, options = {}) => checks.request.fetch(api + url, {
      ...options, maxRedirects: 0, headers: { ...(owner ? { Cookie: `geupddong_access=${metadata.tokens[owner]}` } : {}), Origin: trustedOrigin, ...options.headers },
    })
    const failure = async (response, status, code) => {
      assert.equal(response.status(), status)
      assert.equal((await response.json()).error.code, code)
    }
    await failure(await call(null, '/api/v1/reviews/me'), 401, 'AUTHENTICATION_REQUIRED')
    await failure(await call(4, '/api/v1/reviews', { method: 'POST', data: body(), headers: { Origin: 'https://evil.example', 'Idempotency-Key': crypto.randomUUID() } }), 403, 'REVIEW_ORIGIN_DENIED')
    const badPosition = body(); badPosition.position.latitude = 37
    assert.equal((await call(4, '/api/v1/reviews', { method: 'POST', data: badPosition, headers: { 'Idempotency-Key': crypto.randomUUID() } })).status(), 400)
    const stalePosition = body(); stalePosition.position.measuredAt = new Date(Date.now()-301000).toISOString()
    assert.equal((await call(4, '/api/v1/reviews', { method: 'POST', data: stalePosition, headers: { 'Idempotency-Key': crypto.randomUUID() } })).status(), 400)
    const inaccurate = body(); inaccurate.position.accuracyMeters = 51
    assert.equal((await call(4, '/api/v1/reviews', { method: 'POST', data: inaccurate, headers: { 'Idempotency-Key': crypto.randomUUID() } })).status(), 400)
    await failure(await call(7, '/api/v1/reviews', { method: 'POST', data: body(), headers: { 'Idempotency-Key': crypto.randomUUID() } }), 403, 'POLICY_CONSENT_REQUIRED')
    const key = crypto.randomUUID(), request = body()
    const accepted = await call(4, '/api/v1/reviews', { method: 'POST', data: request, headers: { 'Idempotency-Key': key } })
    assert.equal(accepted.status(), 201); const stored = await accepted.json()
    assert.equal((await (await call(4, '/api/v1/reviews', { method: 'POST', data: request, headers: { 'Idempotency-Key': key } })).json()).id, stored.id)
    const duplicate = await call(4, '/api/v1/reviews', { method: 'POST', data: body(), headers: { 'Idempotency-Key': crypto.randomUUID() } })
    await failure(duplicate, 409, 'REVIEW_ALREADY_EXISTS'); assert.equal((await duplicate.json()).error.existingReviewId, stored.id)
    await failure(await call(5, `/api/v1/reviews/${stored.id}`), 404, 'REVIEW_NOT_FOUND')
    await failure(await call(5, `/api/v1/reviews/${stored.id}`, { method: 'PATCH', data: { version: 0, satisfaction: 5, cleanliness: 5, paper: true, waitMinutes: 0, comment: '타인 변경 시도' } }), 404, 'REVIEW_NOT_FOUND')
    const concurrent = await Promise.all([0, 1].map(() => call(6, '/api/v1/reviews', { method: 'POST', data: body(), headers: { 'Idempotency-Key': crypto.randomUUID() } })))
    assert.deepEqual(concurrent.map(r=>r.status()).sort(), [201,409], 'real database serializes simultaneous duplicate writes')
    assert.equal(accepted.headers()['cache-control'], 'private, no-store')
    const preflight=await call(null,'/api/v1/reviews/1',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'PATCH','Access-Control-Request-Headers':'Content-Type,Idempotency-Key'}})
    assert.equal(preflight.status(),200);assert.equal(preflight.headers()['access-control-allow-origin'],trustedOrigin)
    console.log('PASS real HTTP: cookie JWT, origin, mandatory consent, distance/age/accuracy, persisted idempotency, ownership, concurrent 24h limit')
    await checks.close()
    }

    for (const [index, width] of [390,320,1280].entries()) {
      const widths=process.argv.find(arg=>arg.startsWith('--widths='))?.slice(9).split(',').map(Number)
      if(widths && !widths.includes(width))continue
      const owner = index+1, target = index+1
      const context = await browser.newContext({ viewport: { width, height: width>600?1000:844 }, isMobile: width<600, hasTouch: width<600, serviceWorkers: 'block', userAgent: mobileUserAgent })
      await context.addCookies([{ name:'geupddong_access',value:metadata.tokens[owner],domain:'api.geupddong.com',path:'/',httpOnly:true,secure:true,sameSite:'None' }])
      await context.routeWebSocket('**/*',socket=>{if(socket.url().startsWith('ws://127.0.0.1:4187/'))socket.connectToServer();else socket.close()})
      let posts=0, dropAcceptedResponse=true, createdId, rejectedExternal=0, closing=false
      const errors=[], requests=[]
      await context.route('**/*', async route => {
        try {
        const request=route.request(), url=new URL(request.url())
        if(url.origin===virtualApi && url.pathname.startsWith('/api/v1/')) {
          // No route.continue() here: API responses come only from the guarded native fixture.
          const response=await route.fetch({url:api+url.pathname+url.search,maxRedirects:0,maxRetries:0,headers:{...await request.allHeaders(),origin:trustedOrigin}})
          if(url.pathname.startsWith('/api/v1/reviews'))requests.push({path:url.pathname,query:url.search,method:request.method(),status:response.status()})
          if(request.method()==='POST' && url.pathname==='/api/v1/reviews') {
            posts++
            if(response.status()===201){createdId=(await response.json()).id;if(dropAcceptedResponse){dropAcceptedResponse=false;return route.abort('internetdisconnected')}}
          }
          return route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':virtualWeb,'access-control-allow-credentials':'true'}})
        }
        if(url.origin===virtualWeb) {
          if(url.pathname==='/cdn-cgi/rum')return route.fulfill({status:204})
          if(!['GET','HEAD'].includes(request.method()))throw new Error('Unexpected web mutation')
          return route.continue() // Exact loopback web origin only; preserves browser local-network classification.
        }
        rejectedExternal++;return route.abort()
        } catch {
          // Playwright transport diagnostics contain request cookies. Never print them, even for fixture JWTs.
          if(!closing)errors.push('Fixture transport failed (details suppressed)')
          await route.abort().catch(()=>{})
        }
      })
      await context.addInitScript(() => {
        window.apiGeoCalls=0
        Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){window.apiGeoCalls++;setTimeout(()=>ok({coords:{latitude:36.3,longitude:127.3,accuracy:10},timestamp:Date.now()}),10)},watchPosition(){return 1},clearWatch(){}}})
        class LatLng{constructor(lat,lng){this.lat=lat;this.lng=lng}getLat(){return this.lat}getLng(){return this.lng}}
        class MapMock{constructor(el,o){this.el=el;this.center=o.center;this.level=o.level;this.listeners={}}getCenter(){return this.center}getLevel(){return this.level}getBounds(){return{getSouthWest:()=>new LatLng(36.29,127.29),getNorthEast:()=>new LatLng(36.31,127.31)}}getProjection(){return{pointFromCoords:()=>({x:innerWidth>600?700:180,y:300})}}relayout(){}panTo(p){this.center=p}setCenter(p){this.center=p}setDraggable(){}setZoomable(){}setLevel(v){this.level=v}}
        class Overlay{constructor(o){this.options=o}setMap(map){this.options.content.remove();if(map){Object.assign(this.options.content.style,{position:'absolute',left:'100px',top:'120px'});map.el.append(this.options.content)}}}
        window.kakao={maps:{Map:MapMock,LatLng,CustomOverlay:Overlay,event:{preventMap(){},addListener(map,name,fn){(map.listeners[name]??=[]).push(fn)}},services:{Status:{OK:'OK',ZERO_RESULT:'ZERO'}}}}
      })
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
      page.on('console',m=>{if(m.type()==='error')console.log('Browser console',m.text().slice(0,300))})
      page.on('response',r=>{if(r.status()>=400)console.log('Browser response',r.status(),new URL(r.url()).pathname)})
      await page.goto(virtualWeb+'/toilet/'+target,{waitUntil:'networkidle'})
      await page.locator('.app-shell[data-review-api=true]').waitFor({timeout:15000}).catch(async error=>{
        await page.screenshot({path:path.join(output,`failed-${width}.png`)})
        console.log('Fixture page errors',errors);console.log('Fixture page text',(await page.locator('body').innerText()).slice(0,2000));throw error
      })
      await page.addStyleTag({content:'nextjs-portal{pointer-events:none!important}'})
      const card=page.locator('.map-stage .place-card').first(), list=page.getByRole('region',{name:'내 리뷰 목록',exact:true})
      await card.getByRole('button',{name:'리뷰',exact:true}).click()
      const form=page.getByRole('dialog',{name:'리뷰 쓰기',exact:true})
      await form.getByRole('radio',{name:'만족도 4점'}).check();await form.getByRole('radio',{name:'청결도 5점'}).check()
      await form.getByRole('button',{name:'있었어요',exact:true}).click();await form.locator('textarea').fill(`격리 DB 작성 ${width}`)
      await form.getByRole('button',{name:'리뷰 남기기',exact:true}).click();await form.getByRole('alert').waitFor()
      assert.ok(createdId,'201 accepted by real API before response is deliberately lost')
      const gps=await page.evaluate(()=>window.apiGeoCalls)
      await form.getByRole('button',{name:'리뷰 남기기',exact:true}).click()
      const existingPrompt=page.getByRole('dialog',{name:'작성한 리뷰가 있어요',exact:true})
      await existingPrompt.getByText('이 화장실에 오늘 작성한 리뷰가 있어요. 기존 리뷰를 확인할까요?',{exact:true}).waitFor()
      assert.equal(posts,1);assert.equal(await page.evaluate(()=>window.apiGeoCalls),gps)
      await existingPrompt.getByRole('button',{name:'내 리뷰 보기',exact:true}).click()
      await list.getByRole('status').filter({hasText:'작성한 리뷰 내역이 있습니다'}).waitFor()
      await list.locator('.rv-full-comment').filter({hasText:`격리 DB 작성 ${width}`}).waitFor()
      await page.reload({waitUntil:'networkidle'});await page.addStyleTag({content:'nextjs-portal{pointer-events:none!important}'})
      await card.getByRole('button',{name:'리뷰',exact:true}).click()
      await page.getByRole('dialog',{name:'작성한 리뷰가 있어요',exact:true}).getByRole('button',{name:'내 리뷰 보기',exact:true}).click()
      await list.locator('.rv-full-comment').filter({hasText:`격리 DB 작성 ${width}`}).waitFor()
      assert.equal(await page.evaluate(()=>window.apiGeoCalls),0)
      await list.getByRole('button',{name:'수정하기',exact:true}).click()
      const edit=page.getByRole('dialog',{name:'리뷰 수정',exact:true})
      await edit.locator('textarea').fill(`격리 DB 수정 ${width}`);await edit.getByRole('button',{name:'수정한 내용 저장'}).click()
      await page.getByRole('button',{name:'내 리뷰 보기',exact:true}).click()
      const staleEdit=await context.request.patch(api+`/api/v1/reviews/${createdId}`,{headers:{Cookie:`geupddong_access=${metadata.tokens[owner]}`,Origin:trustedOrigin},data:{version:0,satisfaction:1,cleanliness:1,paper:false,waitMinutes:0,comment:'이전 버전 변경'}})
      assert.equal(staleEdit.status(),409);assert.equal((await staleEdit.json()).error.code,'REVIEW_CHANGED')
      await list.locator('.history-review-summary').first().click()
      await list.getByRole('button',{name:'작성자 정보 지우기',exact:true}).click();await list.getByRole('button',{name:'정보 지우기',exact:true}).click()
      await list.getByRole('status').filter({hasText:'작성자 정보만 지웠어요'}).waitFor()
      assert.equal(await list.getByText(`격리 DB 수정 ${width}`,{exact:true}).count(),0)
      const publicRows=await(await context.request.get(api+`/api/v1/toilets/${target}/reviews`)).json()
      const retained=publicRows.items.find(row=>row.id===createdId)
      assert.equal(retained.comment,`격리 DB 수정 ${width}`);assert.equal(retained.authorDisplayName,'익명');assert.equal(retained.authorRemoved,true)
      await openHistoryFilters(list)
      await list.getByRole('group',{name:'조회 기간'}).getByRole('button',{name:'전체',exact:true}).click()
      await list.locator('.history-card').first().waitFor()
      for(let n=0;n<2;n++){await list.getByRole('button',{name:'리뷰 더 보기',exact:true}).scrollIntoViewIfNeeded();await page.waitForFunction(min=>document.querySelectorAll('.history-reviews .history-card').length>=min,n===0?20:24)}
      assert.equal(await list.locator('.history-card').count(),24)
      assert.ok(requests.some(r=>r.query.includes('cursor=')))
      const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(Date.now()-14*86400000))
      await openHistoryFilters(list)
      await list.getByRole('button',{name:'날짜 직접 선택'}).click()
      await selectCalendarDate(list,'시작일',day);await selectCalendarDate(list,'종료일',day)
      await list.getByRole('button',{name:'적용',exact:true}).click()
      await list.getByText('격리 시험 화장실 22',{exact:true}).waitFor();assert.equal(await list.locator('.history-card').count(),1)
      await list.locator('.history-review-summary').click();assert.equal(await list.getByRole('button',{name:'수정하기',exact:true}).count(),0)
      const expiredItems=await(await context.request.get(api+`/api/v1/reviews/me?from=${day}&to=${day}`,{headers:{Cookie:`geupddong_access=${metadata.tokens[owner]}`}})).json()
      assert.equal(expiredItems.items.length,1)
      const expired=await context.request.post(api+`/api/v1/reviews/${expiredItems.items[0].id}/detach-author`,{headers:{Cookie:`geupddong_access=${metadata.tokens[owner]}`,Origin:trustedOrigin},data:{version:0,acknowledgeContentRetention:true}})
      assert.equal(expired.status(),403);assert.equal((await expired.json()).error.code,'REVIEW_EDIT_EXPIRED')
      await page.screenshot({path:path.join(output,`real-api-history-${width}.png`)})
      if(width<600){await list.getByRole('button',{name:'내 리뷰 닫기'}).click();await page.getByRole('navigation',{name:'하단 내비게이션'}).getByRole('button',{name:'지도',exact:true}).click()}
      else await page.getByRole('dialog',{name:'내 리뷰',exact:true}).getByRole('button',{name:'닫기',exact:true}).click()
      await card.getByRole('button',{name:'리뷰',exact:true}).click();await page.locator('.review-entry-hint').filter({hasText:'24시간'}).waitFor()
      assert.equal(await page.getByRole('dialog').count(),0)
      assert.deepEqual(errors,[])
      console.log(`PASS real API/MySQL UI ${width}: one persisted write, lost-response retry, reload, versioned edit, anonymous retention, cursor/date list, 7d expiry, 24h unlink guard; external requests blocked=${rejectedExternal}`)
      closing=true
      await page.goto('about:blank')
      await context.unrouteAll({behavior:'wait'})
      await context.close()
    }
  } finally {await browser.close()}
})().catch(error=>{console.error(error.name+': '+String(error.message).split('\n')[0]);process.exitCode=1})
