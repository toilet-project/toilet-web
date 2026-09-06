const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const assert=require('node:assert/strict')
const {mobileTestOrigin}=require('./mobile-test-origin.cjs')
const origin=mobileTestOrigin(process.env.MOBILE_TEST_ORIGIN,{allowLoopback:true})
;(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true})
 try {
  for(const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:1024,height:600},{width:700,height:500}]) {
   const ctx=await browser.newContext({viewport,serviceWorkers:'block'})
   await ctx.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.abort())
   const page=await ctx.newPage(),errors=[]
   page.on('pageerror',e=>errors.push(e.message))
   await page.goto(origin+'/toilet/13144')
   await page.locator('.toilet-marker').first().waitFor()
   await page.locator('.desktop-area-list-item').nth(2).waitFor()
   assert.equal(await page.locator('.connection-status-banner').count(),0)
   await page.locator('.desktop-header-actions .header-account-button').waitFor()
   const header=await page.locator('.topbar-inner').boundingBox()
   assert.ok(header.width<=1201 && Math.abs(header.x-(viewport.width-header.width)/2)<2)
   const menu=page.getByRole('button',{name:'전체 메뉴',exact:true})
   await menu.focus();await page.keyboard.press('ArrowDown')
   await page.getByRole('navigation',{name:'전체 메뉴',exact:true}).waitFor()
   assert.equal(await page.locator('#desktop-header-menu button').first().evaluate(el=>el===document.activeElement),true)
   await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false')
   await menu.click();await page.locator('.brand').focus();await page.keyboard.press('Tab')
   assert.equal(await menu.getAttribute('aria-expanded'),'false')
   await menu.click();await page.locator('.topbar').click({position:{x:4,y:4}})
   assert.equal(await menu.getAttribute('aria-expanded'),'false')
   // Record every painted card frame, including cache/detail response transitions.
   await page.evaluate(()=>{
    window.cardFrames=[];window.originalMap=document.querySelector('.map');window.originalTile=window.originalMap.firstChild
    function sample(){const m=document.querySelector('.map'),c=document.querySelector('.place-card:not(.initial-route-card)');if(c&&m){const a=c.getBoundingClientRect(),b=m.getBoundingClientRect();window.cardFrames.push({title:c.querySelector('h1')?.textContent,x:a.x,y:a.y,w:a.width,h:a.height,inside:a.x>=b.x-1&&a.y>=b.y-1&&a.right<=b.right+1&&a.bottom<=b.bottom+1})}window.cardFrame=requestAnimationFrame(sample)}sample()
   })
   const names=await page.locator('.toilet-marker').evaluateAll(els=>[...new Set(els.map(el=>el.getAttribute('aria-label')))].slice(0,3))
   for(const name of [...names,...names]) {
    await page.getByRole('button',{name,exact:true}).dispatchEvent('click')
    await page.locator('.place-card .report-entry-button').waitFor()
    await page.waitForTimeout(350)
   }
   const frames=await page.evaluate(()=>window.cardFrames)
   assert.ok(frames.length>0 && frames.every(x=>x.inside),'A painted card escaped the map')
   for(const name of names){const f=frames.filter(f=>f.title===name);assert.ok(Math.max(...f.map(x=>x.x))-Math.min(...f.map(x=>x.x))<=1 && Math.max(...f.map(x=>x.y))-Math.min(...f.map(x=>x.y))<=1,'Same card jumped while loading: '+name)}
   assert.ok(await page.evaluate(()=>window.originalMap===document.querySelector('.map')&&window.originalTile===window.originalMap.firstChild))
   await page.setViewportSize({width:Math.max(641,viewport.width-130),height:Math.max(350,viewport.height-200)})
   await page.waitForTimeout(500)
   assert.ok((await page.evaluate(()=>window.cardFrames.slice(-10))).every(x=>x.inside),'Resize clipped the card')
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
   assert.deepEqual(errors,[])
   if(process.env.DESKTOP_SCREENSHOT && viewport.width===1440) await page.screenshot({path:process.env.DESKTOP_SCREENSHOT})
   console.log(JSON.stringify({viewport,status:'PASS',headerCentered:true,keyboardMenu:true,allPaintedFramesInside:true,noLoadingJump:true,mapPreserved:true,resize:true}))
   await ctx.close()
  }
  const authContext=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'})
  await authContext.route('**/*',route=>{
   const req=route.request(),path=new URL(req.url()).pathname
   if(path==='/api/v1/auth/me') return route.fulfill({json:{userId:'fixture',displayName:'검증 계정',email:null,status:'ACTIVE',roles:['USER'],consentRequired:false}})
   if(path.includes('/notifications')) return route.fulfill({json:path.includes('unread')?{count:2}:[]})
   return ['GET','HEAD','OPTIONS'].includes(req.method())?route.continue():route.abort()
  })
  const authPage=await authContext.newPage()
  await authPage.goto(origin+'/toilet/13144')
  await authPage.locator('.desktop-header-actions .header-account-button').filter({hasText:'내 계정'}).waitFor()
  await authPage.locator('.desktop-header-actions .notification-button').waitFor()
  await authPage.getByRole('button',{name:'전체 메뉴',exact:true}).click()
  for(const name of ['내 제보','내 계정','로그아웃']) assert.equal(await authPage.locator('#desktop-header-menu').getByRole('button',{name,exact:true}).count(),1)
  console.log(JSON.stringify({authenticatedMenuFixture:'PASS',realAccountWrites:0}))
  await authContext.close()
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
