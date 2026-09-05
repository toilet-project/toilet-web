// Chromium touch/viewport regression, NOT a claim of real iPhone Safari coverage.
// Public map/SSR reads are live. Auth/consent/report writes are browser-local fixtures.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const assert = require('node:assert/strict')
const origin = process.env.MOBILE_TEST_ORIGIN || 'https://preview.geupddong.com'
assert.ok(['https://preview.geupddong.com','http://127.0.0.1:4174','http://192.168.0.4:4174'].includes(origin), 'Only isolated preview/local targets are allowed')
const results = []
async function visible(locator) { await locator.waitFor({ state:'visible', timeout:30000 }) }
async function withinViewport(page, locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  assert.ok(box && box.width>0 && box.height>0, 'Control has no layout box')
  const size = page.viewportSize()
  assert.ok(box.x>=-1 && box.x+box.width<=size.width+1, 'Control clipped horizontally')
  assert.ok(box.y>=-1 && box.y+box.height<=size.height+1, 'Control clipped vertically')
  assert.ok(await locator.evaluate(element => {
    const b=element.getBoundingClientRect()
    return [b.top+2,b.bottom-2].every(y=>element.contains(document.elementFromPoint(b.left+b.width/2,y)))
  }), 'Control is clipped or covered at its edge')
}
async function noOverflow(page) {
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1), 'Page horizontally overflows')
}
;(async()=>{
  // Only this disposable test browser treats the LAN dev origin like HTTPS for
  // geolocation. Preview uses real HTTPS; no user browser/server settings change.
  const browser=await chromium.launch({channel:'chrome',headless:true,
    args:origin.startsWith('http://192.168.')?['--unsafely-treat-insecure-origin-as-secure='+origin]:[]})
  let lastPage
  try {
    for (const viewport of [{width:375,height:667},{width:390,height:844},{width:430,height:932}]) {
      const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:2,
        geolocation:{latitude:36.3664,longitude:127.344},permissions:['geolocation'],serviceWorkers:'block'})
      let auth='anonymous', newConsent=false, mapFailure=false
      const reports=[], mockedWrites=[], unexpectedWrites=[], errors=[]
      const policies=[['SERVICE_TERMS','이용약관'],['PRIVACY_COLLECTION','개인정보 수집·이용'],['AGE_14_PLUS','만 14세 이상']]
        .map(([key,title],i)=>({id:i+1,key,title,version:'test-1',required:true,effectiveAt:'2026-09-05',contentPath:'/policies/terms'}))
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method()
        const api=url.hostname==='api.geupddong.com' || (url.origin===origin && path.startsWith('/api/v1/'))
        const json=(value,status=200)=>route.fulfill({status,json:value,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true'}})
        if (api && method==='OPTIONS') return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'content-type'}})
        if (api && path.startsWith('/api/v1/auth/login/')) {
          if(origin==='https://preview.geupddong.com') assert.equal(url.searchParams.get('returnTo'),'preview')
          auth=newConsent?'pending':'active'
          return route.fulfill({status:302,headers:{Location:origin+'/?login=success'+(newConsent?'&consent=required':'')}})
        }
        if (request.isNavigationRequest() && ![new URL(origin).hostname,'api.geupddong.com'].includes(url.hostname)) return route.abort('blockedbyclient')
        if (api && path==='/api/v1/auth/me' && method==='GET') return auth==='anonymous'?json({},401):json({userId:'fixture-user',displayName:'검증 사용자',email:null,status:auth==='pending'?'PENDING_CONSENT':'ACTIVE',roles:['USER'],consentRequired:auth==='pending'})
        if (api && path==='/api/v1/policies') return json(policies)
        if (api && path==='/api/v1/auth/consents/status') return json({consentRequired:false,missingPolicies:[],agreedPolicies:[]})
        if (api && path==='/api/v1/reports/me') return json(reports)
        if (api && path==='/api/v1/toilets' && mapFailure) return json({message:'test-only unavailable'},503)
        if (api && path.includes('/notifications')) return json(path.includes('unread')?{count:0}:[])
        // Suppress Cloudflare performance telemetry from this synthetic browser.
        if (url.origin===origin && path==='/cdn-cgi/rum' && method==='POST') return route.fulfill({status:204})
        if (!['GET','HEAD','OPTIONS'].includes(method)) {
          if (api) mockedWrites.push({method,path})
          if (api && path==='/api/v1/auth/refresh') return json({},401)
          if (api && path==='/api/v1/auth/logout') {auth='anonymous';return json({})}
          if (api && path==='/api/v1/auth/consents') {auth='active';return json({})}
          if (api && path==='/api/v1/reports' && method==='POST') {
            const data=request.postDataJSON()
            reports.push({...data,id:100+reports.length,toiletName:'공학1호관',status:'PENDING',createdAt:'2026-09-05T21:00:00+09:00'})
            return json(reports.at(-1),201)
          }
          unexpectedWrites.push({method,host:url.hostname,path})
          return route.abort('blockedbyclient')
        }
        return route.continue()
      })
      const page=await context.newPage()
      lastPage=page
      page.on('pageerror',error=>errors.push(error.message))
      const response=await page.goto(origin+'/toilet/13144',{waitUntil:'domcontentloaded'})
      assert.equal(response.status(),200)
      await visible(page.locator('.place-card'))
      await visible(page.locator('.toilet-marker').first())
      await noOverflow(page)
      const entry=page.locator('.place-card .report-entry-button')
      await withinViewport(page,entry)
      await entry.click()
      await visible(page.getByRole('heading',{name:'로그인하고 정보를 제보해 주세요'}))
      await withinViewport(page,page.getByRole('button',{name:'Google로 계속하기'}))
      // Provider authorization is a local redirect fixture; no credentials or real provider login.
      await page.getByRole('button',{name:'Google로 계속하기'}).click()
      await visible(page.getByRole('heading',{name:'어떤 정보를 알려주실 건가요?'}))
      assert.match(await page.locator('.report-target').innerText(),/공학1호관/)
      await page.getByRole('button',{name:'위치 제보 지도에서 실제 위치를 지정하고 주소를 확인해요.'}).click()
      await visible(page.locator('.report-map-pin'))
      await page.waitForFunction(()=>!document.querySelector('.report-submit')?.disabled)
      await page.getByRole('textbox',{name:'제보 사유'}).fill('모바일 자동 검증용 — 서버로 전송하지 않음')
      assert.ok(await page.getByRole('textbox',{name:'제보 사유'}).evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=16),'Input font must avoid iOS focus zoom trigger')
      await withinViewport(page,page.getByRole('button',{name:'위치 제보 접수',exact:true}))
      await page.getByRole('button',{name:'위치 제보 접수',exact:true}).click()
      await visible(page.getByRole('heading',{name:'이 위치와 주소가 맞습니까?'}))
      await visible(page.locator('.report-confirm-map'))
      await page.getByRole('button',{name:'수정하기',exact:true}).click()
      assert.match(await page.getByRole('textbox',{name:'제보 사유'}).inputValue(),/모바일 자동 검증용/)
      await page.waitForFunction(()=>!document.querySelector('.report-submit')?.disabled)
      await page.getByRole('button',{name:'위치 제보 접수',exact:true}).click()
      await page.getByRole('button',{name:'맞아요, 접수하기',exact:true}).click()
      await visible(page.getByRole('heading',{name:'제보를 접수했어요'}))
      assert.equal(reports.length,1)
      await page.getByRole('button',{name:'내 제보 보기',exact:true}).click()
      await visible(page.locator('.my-report-summary'))
      await page.locator('.my-report-summary').click()
      assert.match(await page.locator('.my-report-detail').innerText(),/모바일 자동 검증용/)
      await page.getByRole('button',{name:'내 제보 닫기'}).click()
      await page.goto(origin+'/toilet/13144')
      await visible(page.locator('.place-card'))
      await page.locator('.mobile-area-list-button').click()
      await visible(page.locator('.mobile-area-list-item').first())
      assert.equal(await page.locator('.place-card').count(),0,'Opening area list must close detail')
      await noOverflow(page)
      const grouped=page.locator('.mobile-area-list-item').filter({has:page.locator('.mobile-area-list-additional')}).first()
      assert.ok(await grouped.count()>0,'Expected live same-coordinate campus group')
      await grouped.click()
      await visible(page.locator('.coordinate-group-card'))
      const toggles=page.locator('.coordinate-group-item-toggle')
      const count=await toggles.count()
      assert.ok(count>1)
      await toggles.last().click()
      await visible(page.locator('.coordinate-group-item.is-expanded .coordinate-report-entry'))
      await withinViewport(page,page.locator('.coordinate-group-item.is-expanded .coordinate-report-entry'))
      assert.match(page.url(),/\/toilet\/\d+/)
      await noOverflow(page)
      if(viewport.width===390) {
        await page.goto(origin+'/toilet/13144')
        await visible(page.locator('.place-card'))
        await page.getByRole('button',{name:'정보 닫기',exact:true}).click()
        await page.waitForURL(origin+'/')
        await page.goBack()
        await page.waitForURL(origin+'/toilet/13144')
        await visible(page.locator('.place-card'))
        await page.goForward()
        await page.waitForURL(origin+'/')
        await page.getByRole('button',{name:'현재 위치',exact:true}).click()
        await visible(page.locator('.current-location-marker'))
        await noOverflow(page)
        // Simulated new registration, followed by mandatory consent and original report target restore.
        auth='anonymous';newConsent=true
        await page.goto(origin+'/toilet/13144')
        await visible(page.locator('.place-card'))
        await page.locator('.place-card .report-entry-button').click()
        await page.getByRole('button',{name:'Kakao로 계속하기'}).click()
        await visible(page.locator('.consent-modal'))
        assert.equal(await page.getByRole('button',{name:'동의하고 시작하기'}).isDisabled(),true)
        await page.getByRole('checkbox',{name:'필수 항목 모두 동의'}).check()
        await page.getByRole('button',{name:'동의하고 시작하기'}).click()
        await visible(page.locator('.report-target'))
        assert.match(await page.locator('.report-target').innerText(),/공학1호관/)
        await page.getByRole('button',{name:'개방 시간 제보 변경된 운영 시간을 알려주세요.'}).click()
        await page.getByRole('textbox',{name:'변경할 개방 시간'}).fill('09:00 ~ 18:00')
        await page.getByRole('textbox',{name:'제보 사유'}).fill('모의 운영시간 검증')
        await page.getByRole('button',{name:'개방 시간 제보 접수',exact:true}).click()
        await visible(page.getByRole('heading',{name:'제보를 접수했어요'}))
        assert.equal(reports.length,2)
        await page.getByRole('button',{name:'지도 돌아가기',exact:true}).click()
        await page.getByRole('button',{name:'내 계정',exact:true}).click()
        await visible(page.locator('.account-dialog'))
        await page.getByRole('button',{name:'회원 탈퇴',exact:true}).click()
        await visible(page.getByText('정말 탈퇴할까요?',{exact:true}))
        await withinViewport(page,page.getByRole('button',{name:'취소',exact:true}))
        await page.getByRole('button',{name:'취소',exact:true}).click()
        await page.getByRole('button',{name:'계정 창 닫기'}).click()
        // Public place search remains live; selections must close overlays without overflow.
        await page.getByRole('combobox',{name:'주소 또는 장소 검색'}).fill('충남대학교')
        const option=page.getByRole('option').first()
        await visible(option)
        await withinViewport(page,option)
        await option.click()
        await visible(page.locator('.search-place-marker'))
        await page.locator('.mobile-area-list-button').click()
        await visible(page.locator('.mobile-area-list'))
        await page.getByRole('button',{name:'지역 목록 닫기',exact:true}).click()
        assert.equal(await page.locator('.mobile-area-list').count(),0)
        await page.locator('.mobile-area-list-button').click()
        await visible(page.locator('.mobile-area-list'))
        const mapBox=await page.locator('.map').boundingBox()
        const mapX=mapBox.x+mapBox.width*0.83,mapY=mapBox.y+mapBox.height*0.17
        await page.mouse.click(mapX,mapY)
        assert.equal(await page.locator('.mobile-area-list').count(),0,'Map click closes list')
        const markerCount=await page.locator('.toilet-marker,.coordinate-group-marker,.cluster-marker').count()
        mapFailure=true
        await page.mouse.move(mapX,mapY)
        await page.mouse.down()
        await page.mouse.move(mapX-55,mapY+35,{steps:12})
        await page.mouse.up()
        await visible(page.locator('.connection-status-banner'))
        assert.match(await page.locator('.connection-status-banner').innerText(),/마지막 정상 갱신/)
        assert.equal(await page.locator('.toilet-marker,.coordinate-group-marker,.cluster-marker').count(),markerCount,'Failed load preserves prior markers')
        mapFailure=false
        await page.getByRole('button',{name:'다시 연결',exact:true}).click()
        await page.locator('.connection-status-banner').waitFor({state:'hidden'})
        await noOverflow(page)
        await page.getByRole('button',{name:'로그아웃',exact:true}).click()
        await visible(page.getByRole('button',{name:'로그인',exact:true}))
      }
      assert.deepEqual(errors,[],'Browser runtime errors')
      assert.deepEqual(unexpectedWrites,[],'Unexpected write attempted')
      results.push({viewport,passed:true,groupCount:count,pageErrors:errors.length,actualBusinessWrites:0,mockedWrites:mockedWrites.length})
      console.log(JSON.stringify(results.at(-1)))
      await context.close()
    }
  } catch(error) {
    if(lastPage && !lastPage.isClosed()) { const url=new URL(lastPage.url());console.error(JSON.stringify({diagnosticUrl:url.origin+url.pathname,visibleText:(await lastPage.locator('body').innerText()).slice(0,2500)})) }
    throw error
  } finally {await browser.close()}
  console.log(JSON.stringify({passed:true,results,limitations:['Chromium touch emulation, not real iPhone Safari','OAuth/consent/report submission are intercepted local fixtures','No production business writes']},null,2))
})().catch(error=>{console.error(error);process.exitCode=1})
