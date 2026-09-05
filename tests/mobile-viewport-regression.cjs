// Phone rotation is real Chromium viewport resizing. Keyboard VisualViewport
// events are synthetic: this does NOT replace an iPhone Safari keyboard check.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const assert=require('node:assert/strict')
const origin=process.env.MOBILE_TEST_ORIGIN || 'https://preview.geupddong.com'
assert.ok(['https://preview.geupddong.com','http://192.168.0.4:4174'].includes(origin))
const visible=locator=>locator.waitFor({state:'visible',timeout:30000})
async function stable(page) { await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))) }
async function checkMobile(page) {
  assert.equal(await page.locator('.desktop-area-list').isVisible(),false,'Phone rotated into desktop list')
  await visible(page.locator('.mobile-area-list-button'))
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow')
}
;(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true})
  const results=[]
  try {
    for(const viewport of [{width:375,height:667},{width:390,height:844},{width:430,height:932}]) {
      const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,serviceWorkers:'block'})
      const errors=[],blocked=[]
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url()),path=url.pathname
        const api=url.hostname==='api.geupddong.com'||(url.origin===origin&&path.startsWith('/api/v1/'))
        const json=value=>route.fulfill({status:200,json:value,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true'}})
        if(api&&path==='/api/v1/auth/me') return json({userId:'fixture',displayName:'검증',status:'ACTIVE',roles:['USER'],consentRequired:false})
        if(api&&path.includes('/notifications')) return json(path.includes('unread')?{count:0}:[])
        if(url.origin===origin&&path==='/cdn-cgi/rum') return route.fulfill({status:204})
        if(!['GET','HEAD','OPTIONS'].includes(request.method())) {blocked.push(path);return route.abort()}
        return route.continue()
      })
      await context.addInitScript(()=>{
        const viewport=new EventTarget()
        let state={height:null,offsetTop:0,scale:1}
        for(const key of ['height','offsetTop','scale']) Object.defineProperty(viewport,key,{get:()=>state[key]??innerHeight})
        Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport})
        window.__setTestViewport=next=>{state={...state,...next};viewport.dispatchEvent(new Event('resize'));viewport.dispatchEvent(new Event('scroll'))}
      })
      const page=await context.newPage()
      page.on('pageerror',error=>errors.push(error.message))
      await page.goto(origin+'/toilet/13144')
      await visible(page.locator('.place-card'))
      await visible(page.locator('.toilet-marker').first())
      await checkMobile(page)
      await page.setViewportSize({width:viewport.height,height:viewport.width})
      await stable(page)
      await checkMobile(page)
      await page.setViewportSize(viewport)
      await stable(page)
      await checkMobile(page)
      const scroll=await page.evaluate(()=>({x:scrollX,y:scrollY,bodyPosition:document.body.style.position}))
      await page.locator('.place-card .report-entry-button').click()
      await page.getByRole('button',{name:'위치 제보 지도에서 실제 위치를 지정하고 주소를 확인해요.'}).click()
      await visible(page.locator('.report-map-pin'))
      assert.equal(await page.evaluate(()=>document.body.style.position),'fixed')
      const close=page.getByRole('button',{name:'제보 닫기'})
      const headerBefore=await close.boundingBox()
      const input=page.getByRole('textbox',{name:'제보 사유'})
      await input.fill('긴 위치 제보 화면의 키보드 복귀 확인. '.repeat(12))
      await page.evaluate(()=>window.__setTestViewport({height:320,offsetTop:70}))
      await stable(page)
      const dialog=await page.locator('.report-modal').boundingBox()
      assert.ok(dialog.y>=70 && dialog.y+dialog.height<=390+1,'Dialog escaped synthetic visible viewport')
      assert.ok(await close.isVisible())
      await page.locator('.report-modal-content').evaluate(el=>el.scrollTop=el.scrollHeight)
      const headerWhileScrolled=await close.boundingBox()
      assert.ok(headerWhileScrolled.y>=70,'Toolbar scrolled away with content')
      await input.evaluate(el=>el.blur())
      await page.evaluate(()=>window.__setTestViewport({height:null,offsetTop:0}))
      await page.waitForTimeout(400)
      await stable(page)
      const headerAfter=await close.boundingBox()
      assert.ok(Math.abs(headerAfter.y-headerBefore.y)<=1,'Header did not return after keyboard dismissal')
      // A user-requested pinch must not be counteracted by viewport normalization.
      const heightBefore=await page.locator('.report-modal-backdrop').evaluate(el=>el.style.getPropertyValue('--report-viewport-height'))
      await page.evaluate(()=>window.__setTestViewport({height:200,offsetTop:50,scale:2}))
      await stable(page)
      assert.equal(await page.locator('.report-modal-backdrop').evaluate(el=>el.style.getPropertyValue('--report-viewport-height')),heightBefore)
      await page.evaluate(()=>window.__setTestViewport({height:null,offsetTop:0,scale:1}))
      await page.setViewportSize({width:viewport.height,height:viewport.width})
      await stable(page)
      const landscapeClose=await close.boundingBox()
      assert.ok(landscapeClose.y>=0 && landscapeClose.y+landscapeClose.height<=viewport.width)
      await page.setViewportSize(viewport)
      await stable(page)
      await close.click()
      assert.deepEqual(await page.evaluate(()=>({x:scrollX,y:scrollY,bodyPosition:document.body.style.position})),scroll,'Page scroll/styles were not restored')
      assert.deepEqual(errors,[])
      assert.deepEqual(blocked,[])
      results.push({viewport,rotation:true,syntheticKeyboard:true,sourceWrites:0})
      console.log(JSON.stringify(results.at(-1)))
      await context.close()
    }
    const desktop=await browser.newPage({viewport:{width:932,height:430}})
    await desktop.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.abort())
    await desktop.goto(origin+'/toilet/13144')
    await visible(desktop.locator('.desktop-area-list'))
    assert.equal(await desktop.locator('.mobile-area-list-button').isVisible(),false,'Fine-pointer desktop became phone layout')
    console.log(JSON.stringify({passed:true,results,shortDesktopPreserved:true,realSafariKeyboard:false}))
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
