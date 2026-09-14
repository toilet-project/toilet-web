// Synthetic component integration only. All non-loopback requests are intercepted or blocked.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright')
const root = path.resolve(__dirname, '..'), routeDir = path.join(root, 'src/app/photo-check')
const evidence = process.env.PHOTO_SCREENSHOTS || path.join(root, '.tmp-photo-check')
const origin = 'http://127.0.0.1:4193'
const version = '12345678-1234-1234-1234-123456789abc'
const reviewVersion = 'abcdef12-1234-1234-1234-123456789abc'
const fixture = `'use client'
import { useState } from 'react'
import { MobilePage } from '../../components/MobileNavigation'
import { PublicReviews } from '../../components/reviews/PublicReviews'
const noop=()=>{}
export default function Fixture(){
 const [user,setUser]=useState('1'), [reviews,setReviews]=useState(false), [profilePhoto,setProfilePhoto]=useState({available:true,publicPhoto:false,imageVersion:'${version}'})
 return <><div style={{position:'fixed',top:0,zIndex:9999,background:'white'}}><button onClick={()=>setUser(user==='1'?'2':'1')}>계정 전환 시험</button><button onClick={()=>setReviews(!reviews)}>리뷰 화면 시험</button></div>
 {reviews?<div className="place-card mobile-card-expanded" style={{position:'relative',inset:'auto',height:460,margin:'60px auto 0'}}><button className="close-button" aria-label="정보 닫기">×</button><PublicReviews toiletId={20} toiletName="합성 화장실"/></div>:<MobilePage tab="account" profile={{userId:user,displayName:'합성 사용자 '+user,email:null,status:'ACTIVE',roles:['USER'],consentRequired:false,profilePhoto:user==='1'?profilePhoto:{available:true,publicPhoto:false,imageVersion:null}}} loading={false} unread={0} onProfile={next=>{if(user==='1'&&next.profilePhoto)setProfilePhoto(next.profilePhoto)}} onReports={noop} onAccount={noop} onLogout={noop} onCountChange={noop} onOpenReport={noop} beforeLogin={noop} onSessionExpired={()=>setUser('2')} onWithdrawn={noop} onBackAccount={noop}/>}</>
}`
;(async () => {
 assert.ok(!fs.existsSync(routeDir), 'Refuse to replace an existing route')
 fs.mkdirSync(routeDir);fs.writeFileSync(path.join(routeDir,'page.tsx'),fixture)
 fs.mkdirSync(evidence,{recursive:true})
 let browser
 try {
  browser=await chromium.launch({channel:'chrome',headless:true})
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'})
  let user='1', setting={available:true,publicPhoto:false,imageVersion:version}, failSave=false, writes=0, imageReads=0, privateOwnReads=0, publicOwnReads=0, reviewPhotoReads=0, reviewReads=0, photoStateReads=0, uploadedPhoto=null, uploadedType=null, uploadedTypes=[]
  const syntheticWebp = Buffer.from(process.env.PHOTO_TEST_WEBP_BASE64,'base64')
  const stamp='2026-09-12T10:00:00+09:00'
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url()),p=u.pathname
   if(u.origin===origin) return route.continue()
   const json=(body,status=200)=>route.fulfill({status,json:body,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'GET,PUT,PATCH,DELETE,OPTIONS','Cache-Control':'no-store'}})
   if(u.hostname!=='api.geupddong.com')return route.abort()
   if(route.request().method()==='OPTIONS')return json({})
   if(p==='/api/v1/auth/me/photo') {
    if(route.request().method()==='GET')photoStateReads++
    if(route.request().method()==='PATCH'){writes++;if(failSave)return json({},500);setting={...setting,...route.request().postDataJSON()}}
    if(route.request().method()==='DELETE'){writes++;setting={available:true,publicPhoto:false,imageVersion:null}}
    if(route.request().method()==='PUT'){writes++;uploadedPhoto=route.request().postDataBuffer();uploadedType=route.request().headers()['content-type'];uploadedTypes.push(uploadedType);if(failSave)return json({},500);setting={available:true,publicPhoto:true,imageVersion:version}}
    return json(user==='1'?setting:{available:true,publicPhoto:false,imageVersion:null})
   }
   if(p==='/api/v1/auth/me/photo/image'||p===`/api/v1/profile-photos/${version}.webp`||p===`/api/v1/profile-photos/${reviewVersion}.webp`){
    imageReads++
    if(p==='/api/v1/auth/me/photo/image')privateOwnReads++
    else if(p===`/api/v1/profile-photos/${version}.webp`)publicOwnReads++
    else reviewPhotoReads++
    if(user!=='1'||!setting.imageVersion||(p.includes('/profile-photos/')&&!setting.publicPhoto))return json({},404)
    return route.fulfill({contentType:'image/webp',body:syntheticWebp,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Cache-Control':p.includes('/profile-photos/')?'public, max-age=14400':'private, max-age=86400'}})
   }
   if(p==='/api/v1/toilets/20/reviews'){reviewReads++;const items=Array.from({length:4},(_,index)=>({id:String(10+index),toiletId:20,toiletName:'합성 화장실',satisfaction:index===0?4:5,cleanliness:5,paper:true,waitMinutes:0,comment:index===0?'합성 리뷰':`합성 리뷰 ${index+1}`,version:0,createdAt:stamp,updatedAt:stamp,editableUntil:stamp,canManage:false,authorRemoved:false,authorDisplayName:'합성 사용자 1',authorPhotoVersion:setting.publicPhoto?reviewVersion:null}));return json({items,hasMore:false,nextCursor:null})}
   return json({},404)
  })
  const page=await context.newPage(),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(origin+'/photo-check')
  await page.locator('.mobile-avatar img').waitFor()
  assert.equal(photoStateReads,0)
  assert.equal(await page.locator('.mobile-avatar img').getAttribute('src'),`https://api.geupddong.com/api/v1/auth/me/photo/image?version=${version}`)
  await page.getByRole('button',{name:'프로필 사진 변경',exact:true}).click()
  await page.getByRole('dialog',{name:'프로필 사진 메뉴'}).waitFor()
  await page.getByRole('button',{name:'보관함에서 사진 선택',exact:true}).waitFor()
  await page.getByRole('button',{name:'프로필 사진 삭제',exact:true}).waitFor()
  await page.screenshot({path:path.join(evidence,'photo-actions-mobile.png'),fullPage:true})
  await page.getByRole('button',{name:'취소',exact:true}).click()
  await page.getByRole('button',{name:'프로필 수정',exact:true}).click()
  const visibility=page.getByRole('switch',{name:'리뷰에 프로필 사진 공개'})
  await visibility.waitFor()
  await page.locator('.mobile-avatar img').waitFor()
  assert.equal(await visibility.getAttribute('aria-checked'),'false')
  assert.deepEqual(await visibility.evaluate(button=>{
   const knob=button.querySelector('i').getBoundingClientRect(),label=button.querySelector('span').getBoundingClientRect()
   return {background:getComputedStyle(button).backgroundColor,knobBeforeLabel:knob.right<=label.left}
  }),{background:'rgb(174, 179, 176)',knobBeforeLabel:true})
  await page.screenshot({path:path.join(evidence,'private-mobile.png'),fullPage:true})
  await visibility.click()
  await page.waitForFunction(()=>document.querySelector('[role="switch"]')?.getAttribute('aria-checked')==='true')
  assert.equal(writes,1);assert.equal(setting.publicPhoto,true)
  assert.equal(await visibility.getAttribute('aria-checked'),'true')
  await page.waitForFunction(version=>document.querySelector('.mobile-avatar img')?.getAttribute('src')===`https://api.geupddong.com/api/v1/profile-photos/${version}.webp`,version)
  for(let attempt=0;attempt<100&&publicOwnReads===0;attempt++)await page.waitForTimeout(25)
  assert.ok(publicOwnReads>=1)
  assert.deepEqual(await visibility.evaluate(button=>{
   const knob=button.querySelector('i').getBoundingClientRect(),label=button.querySelector('span').getBoundingClientRect()
   return {background:getComputedStyle(button).backgroundColor,labelBeforeKnob:label.right<=knob.left}
  }),{background:'rgb(23, 104, 58)',labelBeforeKnob:true})
  assert.equal(await page.getByText(/리뷰 작성자 사진을 (공개했어요|비공개로 바꿨어요)/).count(),0)
  const reviewPhotoReadsBeforePrefetch=reviewPhotoReads
  await page.getByRole('button',{name:'리뷰 화면 시험'}).click()
  await page.locator('.public-reviews').waitFor()
  for(let attempt=0;attempt<100&&(reviewReads===0||reviewPhotoReads===reviewPhotoReadsBeforePrefetch);attempt++)await page.waitForTimeout(25)
  assert.equal(reviewReads,1);assert.equal(reviewPhotoReads,reviewPhotoReadsBeforePrefetch+1)
  const reviewPhotoReadsAfterPrefetch=reviewPhotoReads
  await page.getByText('합성 리뷰',{exact:true}).waitFor()
  await page.locator('.public-review-avatar img').first().waitFor()
  assert.equal(await page.locator('.public-review-summary-list .public-review-row').count(),3)
  assert.equal(await page.locator('.public-review-summary-list .public-review-rating').first().innerText(),'4.5')
  assert.equal(reviewReads,1);assert.equal(reviewPhotoReads,reviewPhotoReadsAfterPrefetch)
  await page.screenshot({path:path.join(evidence,'public-review.png'),fullPage:true})
  await page.getByRole('button',{name:/전체보기/}).click()
  await page.getByRole('region',{name:'합성 화장실 전체 리뷰'}).waitFor()
  assert.equal(await page.locator('.public-review-full-list .public-review-row').count(),4)
  const backBox=await page.getByRole('button',{name:'화장실 상세로 돌아가기'}).boundingBox(),closeBox=await page.getByRole('button',{name:'정보 닫기'}).boundingBox()
  assert.ok(backBox&&closeBox&&Math.abs((backBox.y+backBox.height/2)-(closeBox.y+closeBox.height/2))<8)
  assert.equal(await page.getByRole('button',{name:'정보 닫기'}).evaluate(close=>{
    const box=close.getBoundingClientRect(),top=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)
    return top===close||close.contains(top)
  }),true,'detail close button must remain visible and clickable above the full review panel')
  await page.screenshot({path:path.join(evidence,'public-review-full.png'),fullPage:true})
  await page.getByRole('button',{name:'화장실 상세로 돌아가기'}).click()
  assert.equal(await page.locator('.public-review-full-panel').count(),0)
  await page.getByRole('button',{name:'리뷰 화면 시험'}).click()
  await page.getByRole('button',{name:'프로필 수정',exact:true}).click()
  const ownPhotoBeforeOff=await page.locator('.mobile-avatar img').getAttribute('src'),privateOwnReadsBeforeOff=privateOwnReads
  await page.getByRole('switch',{name:'리뷰에 프로필 사진 공개'}).click()
  await page.waitForFunction(()=>document.querySelector('[role="switch"]')?.getAttribute('aria-checked')==='false')
  assert.equal(writes,2);assert.equal(setting.publicPhoto,false)
  await page.waitForFunction(version=>document.querySelector('.mobile-avatar img')?.getAttribute('src')===`https://api.geupddong.com/api/v1/auth/me/photo/image?version=${version}`,version)
  assert.equal(privateOwnReads,privateOwnReadsBeforeOff)
  assert.notEqual(await page.locator('.mobile-avatar img').getAttribute('src'),ownPhotoBeforeOff)
  assert.equal(await page.getByText(/리뷰 작성자 사진을 (공개했어요|비공개로 바꿨어요)/).count(),0)
  await page.getByRole('button',{name:'리뷰 화면 시험'}).click()
  await page.waitForFunction(()=>!document.querySelector('.public-review-avatar img'))
  await page.getByRole('button',{name:'리뷰 화면 시험'}).click()
  await page.getByRole('button',{name:'프로필 수정',exact:true}).click()
  failSave=true
  await page.getByRole('switch',{name:'리뷰에 프로필 사진 공개'}).click()
  await page.getByText(/사진 공개 설정을 저장하지 못했어요/).waitFor();assert.equal(writes,3);assert.equal(setting.publicPhoto,false)
  failSave=false
  await page.getByRole('button',{name:'프로필 사진 변경',exact:true}).click()
  await page.getByRole('button',{name:'프로필 사진 삭제',exact:true}).click()
  await page.getByText('프로필 사진을 삭제했어요.').waitFor()
  await page.waitForFunction(()=>!document.querySelector('.mobile-avatar img'))
  await page.getByRole('button',{name:'프로필 사진 변경',exact:true}).click()
  await page.getByRole('dialog',{name:'프로필 사진 메뉴'}).waitFor()
  assert.equal(await page.locator('#profile-photo-file').getAttribute('accept'),'image/*')
  const largeSource = Buffer.concat([syntheticWebp,Buffer.alloc(2*1024*1024+1)])
  await page.locator('#profile-photo-file').setInputFiles({name:'profile.webp',mimeType:'image/webp',buffer:largeSource})
  await page.getByRole('dialog',{name:'프로필 사진 편집'}).waitFor()
  await page.locator('.photo-crop-grid').waitFor()
  assert.equal(await page.getByText('사진 맞추기',{exact:true}).count(),0)
  await page.getByRole('slider',{name:'사진 확대'}).fill('1.5')
  await page.getByRole('button',{name:'사진 위치 초기화'}).click()
  assert.equal(await page.getByRole('slider',{name:'사진 확대'}).inputValue(),'1')
  await page.getByRole('slider',{name:'사진 확대'}).fill('1.5')
  assert.equal(await page.evaluate(()=>{
   const zoom=document.querySelector('.photo-crop-zoom')?.getBoundingClientRect()
   const apply=document.querySelector('.photo-crop-apply')?.getBoundingClientRect()
   return Boolean(zoom&&apply&&apply.top>zoom.bottom)
  }),true)
  await page.screenshot({path:path.join(evidence,'crop-mobile.png'),fullPage:true})
  failSave=true
  await page.getByRole('button',{name:'적용하기',exact:true}).click()
  await page.getByText('사진을 저장하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.').waitFor()
  assert.equal(await page.getByRole('dialog',{name:'프로필 사진 편집'}).count(),1)
  assert.equal(uploadedType,'image/webp')
  failSave=false
  await page.evaluate(()=>{
   const original=HTMLCanvasElement.prototype.toBlob
   HTMLCanvasElement.prototype.toBlob=function(callback,type,quality){return original.call(this,callback,type==='image/webp'?'image/png':type,quality)}
  })
  await page.getByRole('button',{name:'적용하기',exact:true}).click()
  await page.getByText('프로필 사진을 저장했어요.').waitFor()
  await page.locator('.mobile-avatar img').waitFor()
  assert.deepEqual(uploadedTypes.slice(-2),['image/webp','image/png'])
  assert.equal(uploadedType,'image/png')
  assert.deepEqual([...uploadedPhoto.subarray(0,8)],[137,80,78,71,13,10,26,10])
  assert.notDeepEqual(uploadedPhoto,syntheticWebp)
  assert.ok(uploadedPhoto.length<2*1024*1024)
  user='2';await page.getByRole('button',{name:'계정 전환 시험'}).click()
  await page.getByRole('heading',{name:'합성 사용자 2'}).waitFor()
  assert.equal(await page.locator('.mobile-avatar img').count(),0)
  assert.equal(photoStateReads,0)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({passed:true,writes,imageReads,privateOwnReads,publicOwnReads,reviewPhotoReads,reviewReads,photoStateReads,checks:['auth-profile-photo-first-paint','native-browser-image-cache','photo-action-sheet','pill-visibility-switch','toggle-no-success-message','private-owner','public-owner-cdn','off-keeps-own-photo','off-private-browser-cache-reuse','off-hides-public-review','public-review-prefetch','public-review-photo-decode','public-review-browser-cache-reuse','revocation','save-failure','delete','large-source-auto-resize','crop-grid','reset-icon','apply-layout','webp-export','png-export-fallback','client-crop-upload','account-switch','mobile-width']}))
  await context.close()
 } finally {
  if(browser)await browser.close()
  fs.unlinkSync(path.join(routeDir,'page.tsx'));fs.rmdirSync(routeDir)
 }
})().catch(error=>{console.error(error);process.exitCode=1})
