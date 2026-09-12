// Synthetic component integration only. All non-loopback requests are intercepted or blocked.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright')
const root = path.resolve(__dirname, '..'), routeDir = path.join(root, 'src/app/photo-check')
const evidence = process.env.PHOTO_SCREENSHOTS || path.join(root, '.tmp-photo-check')
const origin = 'http://127.0.0.1:4193'
const version = '12345678-1234-1234-1234-123456789abc'
const fixture = `'use client'
import { useState } from 'react'
import { MobilePage } from '../../components/MobileNavigation'
import { PublicReviews } from '../../components/reviews/PublicReviews'
const noop=()=>{}
export default function Fixture(){
 const [user,setUser]=useState('1'), [reviews,setReviews]=useState(false)
 return <><div style={{position:'fixed',top:0,zIndex:9999,background:'white'}}><button onClick={()=>setUser(user==='1'?'2':'1')}>계정 전환 시험</button><button onClick={()=>setReviews(!reviews)}>리뷰 화면 시험</button></div>
 {reviews?<div style={{padding:40}}><PublicReviews toiletId={20}/></div>:<MobilePage tab="account" profile={{userId:user,displayName:'합성 사용자 '+user,email:null,status:'ACTIVE',roles:['USER'],consentRequired:false}} loading={false} unread={0} onProfile={noop} onReports={noop} onAccount={noop} onLogout={noop} onCountChange={noop} onOpenReport={noop} beforeLogin={noop} onSessionExpired={()=>setUser('2')} onWithdrawn={noop} onBackAccount={noop}/>}</>
}`
;(async () => {
 assert.ok(!fs.existsSync(routeDir), 'Refuse to replace an existing route')
 fs.mkdirSync(routeDir);fs.writeFileSync(path.join(routeDir,'page.tsx'),fixture)
 fs.mkdirSync(evidence,{recursive:true})
 let browser
 try {
  browser=await chromium.launch({channel:'chrome',headless:true})
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})
  let user='1', setting={available:true,useSocial:true,publicPhoto:false,imageVersion:version}, failSave=false, writes=0, imageReads=0
  const syntheticWebp = Buffer.from(process.env.PHOTO_TEST_WEBP_BASE64,'base64')
  const stamp='2026-09-12T10:00:00+09:00'
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url()),p=u.pathname
   if(u.origin===origin) return route.continue()
   const json=(body,status=200)=>route.fulfill({status,json:body,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'GET,PATCH,OPTIONS','Cache-Control':'no-store'}})
   if(u.hostname!=='api.geupddong.com')return route.abort()
   if(route.request().method()==='OPTIONS')return json({})
   if(p==='/api/v1/auth/me/photo') {
    if(route.request().method()==='PATCH'){writes++;if(failSave)return json({},500);const next=route.request().postDataJSON();setting={...setting,...next,imageVersion:next.useSocial?setting.imageVersion:null}}
    return json(user==='1'?setting:{available:true,useSocial:false,publicPhoto:false,imageVersion:null})
   }
   if(p==='/api/v1/auth/me/photo/image'||p==='/api/v1/toilets/20/reviews/10/photo'){
    imageReads++
    if(user!=='1'||!setting.useSocial||(p.includes('/reviews/')&&!setting.publicPhoto))return json({},404)
    return route.fulfill({contentType:'image/webp',body:syntheticWebp,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Cache-Control':'no-store'}})
   }
   if(p==='/api/v1/toilets/20/reviews')return json({items:[{id:'10',toiletId:20,toiletName:'합성 화장실',satisfaction:4,cleanliness:5,paper:true,waitMinutes:0,comment:'합성 리뷰',version:0,createdAt:stamp,updatedAt:stamp,editableUntil:stamp,canManage:false,authorRemoved:false,authorDisplayName:'합성 사용자 1'}],hasMore:false,nextCursor:null})
   return json({},404)
  })
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(origin+'/photo-check')
  await page.getByRole('button',{name:'프로필 수정',exact:true}).click()
  await page.getByRole('combobox',{name:'사진 공개 범위'}).waitFor()
  await page.locator('.mobile-avatar img').waitFor()
  assert.equal(await page.getByRole('combobox').inputValue(),'private')
  await page.screenshot({path:path.join(evidence,'private-mobile.png'),fullPage:true})
  await page.getByRole('combobox').selectOption('public')
  await page.getByRole('button',{name:'사진 설정 저장',exact:true}).click()
  await page.getByText(/사진 설정을 저장했어요/).waitFor();assert.equal(writes,1);assert.equal(setting.publicPhoto,true)
  await page.getByRole('button',{name:'리뷰 화면 시험'}).click()
  await page.getByRole('button',{name:'이용자 리뷰 보기'}).click()
  await page.locator('.public-review-avatar img').waitFor()
  await page.screenshot({path:path.join(evidence,'public-review.png'),fullPage:true})
  setting.publicPhoto=false
  await page.evaluate(()=>window.dispatchEvent(new Event('geupddong-profile-photo-changed')))
  await page.waitForFunction(()=>!document.querySelector('.public-review-avatar img'))
  await page.getByRole('button',{name:'리뷰 화면 시험'}).click()
  await page.getByRole('button',{name:'프로필 수정',exact:true}).click()
  failSave=true
  await page.getByRole('combobox').selectOption('public')
  await page.getByRole('button',{name:'사진 설정 저장',exact:true}).click()
  await page.getByText(/저장 여부를 확인하지 못했어요/).waitFor();assert.equal(writes,2);assert.equal(setting.publicPhoto,false)
  failSave=false;await page.getByRole('checkbox',{name:'소셜 사진 사용',exact:true}).uncheck()
  await page.getByRole('button',{name:'사진 설정 저장',exact:true}).click()
  await page.getByText('소셜 사진 사용을 중단했어요.').waitFor()
  await page.waitForFunction(()=>!document.querySelector('.mobile-avatar img'))
  user='2';await page.getByRole('button',{name:'계정 전환 시험'}).click()
  await page.getByRole('heading',{name:'합성 사용자 2'}).waitFor()
  assert.equal(await page.locator('.mobile-avatar img').count(),0)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({passed:true,writes,imageReads,checks:['private-owner','public-review','revocation','save-failure','stop-use','account-switch','mobile-width']}))
  await context.close()
 } finally {
  if(browser)await browser.close()
  fs.unlinkSync(path.join(routeDir,'page.tsx'));fs.rmdirSync(routeDir)
 }
})().catch(error=>{console.error(error);process.exitCode=1})
