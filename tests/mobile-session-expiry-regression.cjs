// All identity, report, notification and mutation traffic is synthetic and intercepted.
const {chromium, webkit} = require(process.env.PLAYWRIGHT_MODULE_PATH)
const assert = require('node:assert/strict')
const origin = 'http://127.0.0.1:4187'
;(async () => {
 const browser = await (process.env.TEST_WEBKIT ? webkit : chromium).launch(process.env.TEST_WEBKIT ? {headless:true} : {channel:'chrome',headless:true})
 try {
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'})
  let user='A', nextUser='B', mode='', reads=0, writes=0, read=false
  const errors=[]
  await context.route('**/*', async route => {
   const req=route.request(), url=new URL(req.url()), path=url.pathname
   const json=(body,status=200)=>route.fulfill({status,json:body})
   if(url.hostname==='dapi.kakao.com') return route.abort()
   if(path.startsWith('/api/v1/')) {
    if(path==='/api/v1/auth/me') return user?json({userId:user,displayName:`사용자 ${user}`,email:null,status:'ACTIVE',roles:['USER'],consentRequired:false}):json({},401)
    if(path.startsWith('/api/v1/auth/login/')) {user=nextUser;mode='';read=false;return route.fulfill({contentType:'text/html',body:`<script>location.replace('${origin}/?login=success')</script>`})}
    if(path==='/api/v1/auth/refresh') return json({},401)
    if(path==='/api/v1/auth/logout') {user=null;return json({})}
    if(path==='/api/v1/notifications/unread-count') return json({count:user?1:0})
    if(path==='/api/v1/reports/me') {reads++;if(mode==='reports401'){user=null;return json({},401)};return json([{id:1,toiletId:13144,toiletName:`${user} 전용 제보`,reportType:'COORDINATE_CORRECTION',status:'PENDING',createdAt:'2026-09-11T10:00:00+09:00',reason:'가상 검증',roadAddress:'가상 주소'}])}
    if(path==='/api/v1/notifications') {
     if(mode==='inbox401'){user=null;return json({},401)}
     if(mode==='offline') return route.abort('internetdisconnected')
     return json({items:mode==='empty'?[]:[{id:1,type:'REPORT_APPROVED',referenceType:'TOILET_REPORT',referenceId:1,title:`${user} 전용 알림`,message:'가상 알림',read,createdAt:'2026-09-11T10:00:00+09:00'}]})
    }
    if(path.endsWith('/read')||path.endsWith('/read-all')) {
     writes++
     if(mode==='write401'){user=null;return json({},401)}
     if(mode==='write500') return json({},500)
     read=true;return json({})
    }
    // Only public toilet reads can leave this fixture.
    if(!path.startsWith('/api/v1/toilets') || !['GET','HEAD'].includes(req.method())) return route.abort()
   }
   if(!['GET','HEAD','OPTIONS'].includes(req.method())) return route.abort()
   return route.continue()
  })
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
  page.on('console', message => { if (/same key|Cannot update|unmounted component/i.test(message.text())) errors.push(message.text()) })
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='nextjs-portal {pointer-events:none!important}';document.head.append(s)}))
  await page.goto(origin+'/toilet/13144')
  const nav=page.getByRole('navigation',{name:'하단 내비게이션'})
  await nav.getByRole('button',{name:/^알림/}).click()
  await page.getByRole('button',{name:/A 전용 제보/}).waitFor()
  mode='reports401'
  await nav.getByRole('button',{name:'지도',exact:true}).click()
  await nav.getByRole('button',{name:/^알림/}).click()
  await page.getByRole('heading',{name:'로그인하고 알림을 확인하세요'}).waitFor()
  assert.equal(await page.getByText('A 전용 제보').count(),0)
  await page.getByRole('button',{name:'Google로 계속하기'}).click()
  await page.getByRole('button',{name:/B 전용 제보/}).waitFor()
  assert.equal(await page.getByText('A 전용 제보').count(),0)
  mode='inbox401'
  await page.getByRole('button',{name:/^받은 알림/}).click()
  await page.getByRole('heading',{name:'로그인하고 알림을 확인하세요'}).waitFor()
  await page.getByRole('button',{name:'Google로 계속하기'}).click()
  const dialog=page.getByRole('dialog',{name:'알림',exact:true})
  await dialog.getByRole('button',{name:/B 전용 알림/}).waitFor()
  mode='write401'
  await dialog.getByRole('button',{name:/B 전용 알림/}).click()
  await page.getByRole('heading',{name:'로그인하고 알림을 확인하세요'}).waitFor()
  assert.equal(writes,1,'401 write must not replay')
  nextUser='C'
  await page.getByRole('button',{name:'Google로 계속하기'}).click()
  await dialog.getByRole('button',{name:/C 전용 알림/}).waitFor()
  assert.equal(await page.getByText('B 전용 알림').count(),0)
  assert.equal(writes,1,'login does not replay another account action')
  mode='write401'
  await dialog.getByRole('button',{name:'모두 읽음'}).click()
  await page.getByRole('heading',{name:'로그인하고 알림을 확인하세요'}).waitFor()
  assert.equal(writes,2)
  await page.getByRole('button',{name:'Google로 계속하기'}).click()
  await dialog.getByRole('button',{name:/C 전용 알림/}).waitFor()
  mode='write500'
  await dialog.getByRole('button',{name:'모두 읽음'}).click()
  await dialog.getByRole('alert').waitFor()
  assert.equal(await dialog.locator('.is-unread').count(),1)
  mode=''
  await dialog.getByRole('button',{name:'모두 읽음'}).click()
  await page.waitForFunction(()=>!document.querySelector('.notification-item.is-unread'))
  await dialog.getByRole('button',{name:'알림 닫기'}).click()
  mode='offline'
  await page.getByRole('button',{name:/^받은 알림/}).click()
  await dialog.getByRole('alert').waitFor()
  mode='empty'
  await dialog.getByRole('button',{name:'다시 불러오기'}).click()
  await dialog.getByText('새로운 알림이 없어요').waitFor()
  await dialog.getByRole('button',{name:'알림 닫기'}).focus()
  await page.keyboard.press('Tab')
  assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)), 'Tab remains inside dialog')
  await page.keyboard.press('Shift+Tab')
  assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)), 'Reverse Tab remains inside dialog')
  await page.keyboard.press('Escape')
  await dialog.waitFor({state:'hidden'})
  assert.match(await page.evaluate(()=>document.activeElement?.textContent), /받은 알림/)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({pass:true,engine:process.env.TEST_WEBKIT?'webkit':'chromium',reports401:true,inbox401:true,individualAndAllRead401:true,noMutationReplay:true,accountIsolation:true,readFailure:true,empty:true,offlineRetry:true,reads,writes,realBusinessWrites:0}))
  await context.close()
 } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1})
