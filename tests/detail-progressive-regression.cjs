// Isolated browser fixtures: never sends business writes or changes production data.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const assert = require('node:assert/strict')
const { mobileTestOrigin } = require('./mobile-test-origin.cjs')
const origin = mobileTestOrigin(process.env.MOBILE_TEST_ORIGIN, {allowLoopback:true})
const items = [
  {id:13032,name:'공학3호관',toiletType:'개방화장실',latitude:36.365,longitude:127.346},
  {id:12941,name:'중앙도서관',toiletType:'공중화장실',latitude:36.368,longitude:127.347},
  {id:13543,name:'경상대학 및 별관',toiletType:'공중화장실',latitude:36.369,longitude:127.344},
  {id:13144,name:'공학1호관',toiletType:'공중화장실',latitude:36.369,longitude:127.344},
]
function detail(item) {
  return {...item,roadAddress:'검증용 주소 '+item.id,jibunAddress:'',openTime:'상시',openTimeDetail:'',
    maleToiletCount:2,femaleToiletCount:3,hasCctv:'Y',hasEmergencyBell:'N',hasDiaperTable:'N'}
}
;(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true})
  try {
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
      const context=await browser.newContext({viewport,serviceWorkers:'block'})
      const counts=new Map(), errors=[]
      const delay=700
      let failedId=null
      await context.route('**/*',async route=>{
        const req=route.request(),url=new URL(req.url())
        if(!['GET','HEAD','OPTIONS'].includes(req.method())) return route.abort()
        if(url.searchParams.has('_rsc') && url.pathname.startsWith('/toilet/')) {
          await new Promise(resolve=>setTimeout(resolve,2000))
          return route.continue().catch(()=>{})
        }
        if(url.pathname==='/api/v1/toilets') return route.fulfill({json:{meta:{map_level:3,display_type:'MARKER',total_count:4,result_count:4},toilets:items,clusters:[]}})
        const match=url.pathname.match(/^\/api\/v1\/toilets\/(\d+)$/)
        if(match) {
          const id=Number(match[1]),item=items.find(item=>item.id===id)
          counts.set(id,(counts.get(id)||0)+1)
          const failed=id===failedId
          await new Promise(resolve=>setTimeout(resolve,delay))
          return route.fulfill({status:failed?503:200,json:failed?{}:detail(item)}).catch(()=>{})
        }
        return route.continue()
      })
      const page=await context.newPage()
      page.on('pageerror',err=>errors.push(err.message))
      await page.goto(origin+'/toilet/13144')
      await page.locator('.toilet-marker').first().waitFor()
      assert.equal(counts.size,0,'SSR detail should not cause a duplicate browser fetch')
      await page.getByRole('button',{name:'정보 닫기',exact:true}).click()
      await page.waitForURL(origin+'/')
      const map=await page.locator('.map').elementHandle()
      const first=page.getByRole('button',{name:'공학3호관',exact:true})
      const second=page.getByRole('button',{name:'중앙도서관',exact:true})
      await first.click()
      await page.locator('.place-card h1').filter({hasText:'공학3호관'}).waitFor()
      assert.equal(await page.locator('.place-card .card-label').innerText(),'개방화장실')
      await page.locator('.place-card .detail-loading-fields').waitFor()
      assert.equal(await page.locator('.place-card .report-entry-button').count(),0)
      await page.locator('.place-card .report-entry-button').waitFor()
      assert.equal(new URL(page.url()).pathname,'/','API content must appear before delayed RSC navigation')
      await page.waitForURL(origin+'/toilet/13032')
      assert.match(await page.locator('.place-card').innerText(),/검증용 주소 13032/,'Server response must not overwrite fresh browser detail')
      await page.getByRole('button',{name:'정보 닫기',exact:true}).click()
      await page.waitForURL(origin+'/')
      await first.click()
      assert.equal(await page.locator('.place-card .detail-loading-fields').count(),0,'Fresh cached detail should show immediately')
      assert.equal(counts.get(13032),1)
      // Start B then immediately switch to cached A; delayed B must not replace it.
      // A card can cover a marker on mobile: exercise its click handler directly for race tests.
      await second.dispatchEvent('click')
      await page.locator('.place-card h1').filter({hasText:'중앙도서관'}).waitFor()
      await first.dispatchEvent('click')
      await page.waitForTimeout(900)
      assert.equal(await page.locator('.place-card h1').innerText(),'공학3호관')
      await second.dispatchEvent('click')
      await page.getByRole('button',{name:'정보 닫기',exact:true}).click()
      await page.waitForTimeout(2400)
      assert.equal(await page.locator('.place-card').count(),0,'Closed card must not reopen after response')
      assert.ok(await map.evaluate(el=>el.isConnected && el===document.querySelector('.map')))
      // Group detail uses the same partial fields and direct fetch.
      await page.locator('.coordinate-group-marker').first().click()
      await page.locator('.coordinate-group-item-toggle').filter({hasText:'경상대학 및 별관'}).click()
      await page.locator('.coordinate-inline-details .detail-loading-fields').waitFor()
      await page.locator('.coordinate-inline-details .coordinate-inline-facilities').waitFor()
      await page.getByRole('button',{name:'목록 닫기',exact:true}).click()
      await page.waitForURL(origin+'/')
      failedId=12941
      await second.dispatchEvent('click')
      await page.locator('.place-card .detail-error').waitFor()
      assert.equal(await page.locator('.place-card h1').innerText(),'중앙도서관')
      failedId=null
      await page.getByRole('button',{name:'다시 불러오기',exact:true}).click()
      await page.locator('.place-card .report-entry-button').waitFor()
      assert.match(await page.locator('.place-card').innerText(),/검증용 주소 12941/)
      assert.deepEqual(errors,[])
      console.log(JSON.stringify({viewport,status:'PASS',immediateKnownFields:true,apiBeforeRsc:true,cache:true,rapidSwitch:true,close:true,group:true,retry:true,mapPreserved:true}))
      await context.close()
    }
  } finally { await browser.close() }
})().catch(error=>{console.error(error);process.exitCode=1})
