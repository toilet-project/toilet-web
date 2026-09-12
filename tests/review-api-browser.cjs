// Local API-mode UI against a synthetic HTTP boundary, not a live member/review service.
// Only public facility reads may leave the browser. All review writes are intercepted below.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_PACKAGE || 'playwright')
const origin = 'http://127.0.0.1:4187'
const output = process.env.REVIEW_SCREENSHOT_DIR || path.resolve('.tmp-review-api-screenshots')
const mobileUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
fs.mkdirSync(output, { recursive: true })
const now = Date.parse('2026-09-12T03:00:00Z'), day = 86400000
const iso = time => new Date(time).toISOString()
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    for (const width of [390, 320, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: width > 600 ? 1000 : 844 }, isMobile: width < 600, hasTouch: width < 600, serviceWorkers: 'block', userAgent: mobileUserAgent })
      const detail = await (await context.request.get('https://api.geupddong.com/api/v1/toilets/13144')).json()
      let owner = 'api-fixture-owner', statusMode = 'disabled', saveMode = 'before', detachFails = true
      let posts = 0, patches = 0, detaches = 0, blockedWrites = 0, mineReads = [], nextId = 1000
      const rows = Array.from({ length: 25 }, (_, i) => ({ id: String(i+1), toiletId: i+100, toiletName: `합성 목록 ${i+1}`, satisfaction: 4, cleanliness: 5, paper: true, waitMinutes: 0, comment: '합성 과거 리뷰', version: 0,
        createdAt: iso(now-(i+1)*60000), updatedAt: iso(now-(i+1)*60000), editableUntil: iso(now-(i+1)*60000+7*day), canManage: true, authorRemoved: false, authorDisplayName: '합성 사용자' }))
      rows.push({ ...rows[0], id: '50', toiletName: '40일 전 합성 리뷰', createdAt: iso(now-40*day), updatedAt: iso(now-40*day), editableUntil: iso(now-33*day), canManage: false })
      const keys = new Map()
      const error = (route, code, status=409, extra={}) => route.fulfill({ status, json: { error: { code, message: 'server diagnostic should not echo', ...extra } } })
      const currentStatus = () => {
        const r = rows.find(row => row.toiletId === 13144 && Date.parse(row.createdAt) > now-day)
        return r ? { canCreate: false, existingReviewId: r.authorRemoved ? null : r.id, nextAllowedAt: iso(Date.parse(r.createdAt)+day) } : { canCreate: true, existingReviewId: null, nextAllowedAt: null }
      }
      await context.route('**/*', async route => {
        const req = route.request(), u = new URL(req.url()), p = u.pathname
        if (p === '/api/v1/auth/me') return route.fulfill({ json: owner ? { userId: owner, displayName: 'API 검증 사용자', status: 'ACTIVE', roles: ['USER'], consentRequired: false } : null })
        if (p === '/api/v1/auth/refresh') return route.fulfill({ status: 401, json: {} })
        if (p === '/api/v1/notifications/unread-count') return route.fulfill({ json: { count: 0 } })
        if (/\/reviews\/summary$/.test(p)) return route.fulfill({ json: { count: rows.length, rating: 4.0, averageRating: 4.5, paperPercent: 100, paperSampleCount: 25, latestWaitMinutes: 0, latestWaitAt: iso(now) } })
        if (p.startsWith('/api/v1/reviews')) {
          if (!owner) return error(route, 'AUTHENTICATION_REQUIRED', 401)
          if (p === '/api/v1/reviews/creation-status') return statusMode === 'disabled' ? error(route, 'REVIEWS_DISABLED', 503) : route.fulfill({ json: currentStatus() })
          if (p === '/api/v1/reviews/me') {
            mineReads.push(Object.fromEntries(u.searchParams)); assert.equal(u.searchParams.get('size'), '10')
            const start = u.searchParams.has('from') ? Date.parse(u.searchParams.get('from')+'T00:00:00+09:00') : -Infinity
            const end = u.searchParams.has('to') ? Date.parse(u.searchParams.get('to')+'T00:00:00+09:00')+day : Infinity
            const matching = (owner === 'api-fixture-owner' ? rows : []).filter(r => !r.authorRemoved && Date.parse(r.createdAt) >= start && Date.parse(r.createdAt) < end).sort((a,b) => Date.parse(b.createdAt)-Date.parse(a.createdAt))
            const offset = Number(u.searchParams.get('cursor') || 0), items = matching.slice(offset,offset+10), hasMore = offset+10 < matching.length
            return route.fulfill({ json: { items, hasMore, nextCursor: hasMore ? String(offset+10) : null } })
          }
          if (p === '/api/v1/reviews' && req.method() === 'POST') {
            posts++
            const body = req.postDataJSON(), key = req.headers()['idempotency-key']
            assert.ok(key); assert.equal(body.toiletId, 13144); assert.ok(body.position.accuracyMeters <= 50)
            assert.deepEqual(Object.keys(body.position).sort(), ['accuracyMeters','latitude','longitude','measuredAt'])
            if (saveMode === 'before') return route.abort('internetdisconnected')
            if (keys.has(key)) return route.fulfill({ status: 201, json: keys.get(key) })
            const status = currentStatus()
            if (!status.canCreate) return error(route, 'REVIEW_ALREADY_EXISTS', 409, status)
            const r = { ...body, position: undefined, id: String(nextId++), toiletName: detail.name, version: 0, createdAt: iso(now), updatedAt: iso(now), editableUntil: iso(now+7*day), canManage: true, authorRemoved: false, authorDisplayName: '합성 사용자' }
            rows.push(r); keys.set(key,r)
            return saveMode === 'after' ? route.abort('internetdisconnected') : route.fulfill({ status: 201, json: r })
          }
          const match = /^\/api\/v1\/reviews\/(\d+)(\/detach-author)?$/.exec(p), r = match && rows.find(row => row.id === match[1] && !row.authorRemoved)
          if (!r) return error(route, 'REVIEW_NOT_FOUND', 404)
          if (req.method() === 'GET') return route.fulfill({ json: r })
          const body = req.postDataJSON()
          if (body.version !== r.version) return error(route, 'REVIEW_CHANGED')
          if (match[2]) {
            detaches++; assert.equal(body.acknowledgeContentRetention, true)
            if (detachFails) return error(route, 'REQUEST_FAILED', 500)
            r.authorRemoved = true; r.authorDisplayName = '익명'; r.canManage = false; r.version++
            return route.fulfill({ json: { id: r.id, authorDisplayName: '익명', contentRetained: true } })
          }
          assert.equal(req.method(), 'PATCH'); assert.equal('position' in body, false); patches++
          Object.assign(r,body,{ version:r.version+1, updatedAt:iso(now) }); return route.fulfill({ json: r })
        }
        if (p === '/cdn-cgi/rum') return route.fulfill({ status: 204 })
        if (!['GET','HEAD','OPTIONS'].includes(req.method())) { blockedWrites++; return route.abort() }
        if (u.hostname === 'dapi.kakao.com') return route.abort()
        if (p.startsWith('/api/v1/') && !p.startsWith('/api/v1/toilets')) return route.fulfill({ json: [] })
        return route.continue()
      })
      await context.addInitScript(({ now, detail }) => {
        const RealDate = Date
        window.Date = class extends RealDate { constructor(...args) { if(args.length) super(...args); else super(now) } static now(){return now} }
        window.apiGeoCalls = 0
        Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok){window.apiGeoCalls++;setTimeout(()=>ok({coords:{latitude:detail.latitude,longitude:detail.longitude,accuracy:10},timestamp:now}),10)},watchPosition(){return 1},clearWatch(){}}})
        class LatLng {constructor(lat,lng){this.lat=lat;this.lng=lng}getLat(){return this.lat}getLng(){return this.lng}}
        class MapMock {constructor(el,o){this.el=el;this.center=o.center;this.level=o.level;this.listeners={}}getCenter(){return this.center}getLevel(){return this.level}getBounds(){return {getSouthWest:()=>new LatLng(36.35,127.33),getNorthEast:()=>new LatLng(36.38,127.36)}}getProjection(){return {pointFromCoords:()=>({x:innerWidth>600?700:180,y:300})}}relayout(){}panTo(p){this.center=p}setCenter(p){this.center=p}setDraggable(){}setZoomable(){}setLevel(v){this.level=v}}
        class Overlay {constructor(o){this.options=o}setMap(map){this.options.content.remove();if(map){Object.assign(this.options.content.style,{position:'absolute',left:'100px',top:'120px'});map.el.append(this.options.content)}}}
        window.kakao={maps:{Map:MapMock,LatLng,CustomOverlay:Overlay,event:{preventMap(){},addListener(map,name,fn){(map.listeners[name]??=[]).push(fn)}},services:{Status:{OK:'OK',ZERO_RESULT:'ZERO'}}}}
      }, { now, detail })
      const page = await context.newPage(), errors = []
      page.on('pageerror', e => errors.push(e.message))
      await page.goto(origin+'/toilet/13144', { waitUntil: 'networkidle' })
      await page.locator('.app-shell[data-review-api=true]').waitFor()
      await page.addStyleTag({content:'nextjs-portal {pointer-events:none!important}'})
      const card = page.locator('.map-stage .place-card').first(), list = page.getByRole('region',{name:'내 리뷰 목록',exact:true})
      await card.getByRole('button',{name:'리뷰',exact:true}).click()
      await page.locator('.review-entry-hint').filter({hasText:'준비하고'}).waitFor()
      assert.equal(await page.evaluate(()=>window.apiGeoCalls),0,'disabled server cannot prompt GPS or fall back to memory')
      statusMode = 'ready'
      await card.locator('.review-entry').click()
      const form = page.getByRole('dialog',{name:'리뷰 쓰기',exact:true})
      await form.getByRole('radio',{name:'만족도 4점'}).check(); await form.getByRole('radio',{name:'청결도 5점'}).check()
      await form.getByRole('button',{name:'있었어요',exact:true}).click(); await form.locator('textarea').fill('실제 API 경계 합성 시험')
      await form.getByRole('button',{name:'리뷰 남기기',exact:true}).click(); await form.getByRole('alert').waitFor()
      assert.equal(await form.locator('textarea').inputValue(),'실제 API 경계 합성 시험')
      saveMode = 'after'
      await form.getByRole('button',{name:'리뷰 남기기',exact:true}).click(); await form.getByRole('alert').waitFor()
      const callsBeforeRetry = await page.evaluate(()=>window.apiGeoCalls)
      await form.getByRole('button',{name:'리뷰 남기기',exact:true}).click()
      await list.getByRole('status').filter({hasText:'작성한 리뷰 내역이 있습니다'}).waitFor()
      await list.locator('.rv-full-comment').filter({hasText:'실제 API 경계 합성 시험'}).waitFor()
      assert.equal(posts,2,'one pre-commit failure and one lost response; retry finds existing record without a third POST')
      assert.equal(await page.evaluate(()=>window.apiGeoCalls),callsBeforeRetry)
      await page.reload({waitUntil:'networkidle'})
      await page.addStyleTag({content:'nextjs-portal {pointer-events:none!important}'})
      await card.getByRole('button',{name:'리뷰',exact:true}).click()
      await list.locator('.rv-full-comment').filter({hasText:'실제 API 경계 합성 시험'}).waitFor()
      assert.equal(await page.evaluate(()=>window.apiGeoCalls),0,'reload reads persisted API record without a new GPS check')
      await list.getByRole('button',{name:'수정하기',exact:true}).click()
      const editForm = page.getByRole('dialog',{name:'리뷰 수정',exact:true})
      await editForm.locator('textarea').fill('수정한 API 합성 리뷰'); await editForm.getByRole('button',{name:'수정한 내용 저장'}).click()
      await page.getByRole('button',{name:'내 리뷰 보기',exact:true}).click()
      await list.locator('.history-review-summary').first().click()
      await list.getByRole('button',{name:'작성자 정보 지우기',exact:true}).click()
      await list.getByRole('button',{name:'정보 지우기',exact:true}).click()
      await list.getByRole('alert').waitFor(); assert.equal(rows.find(r=>r.id==='1000').authorRemoved,false)
      detachFails = false
      await list.getByRole('button',{name:'정보 지우기',exact:true}).click()
      await list.getByRole('status').filter({hasText:'작성자 정보만 지웠어요'}).waitFor()
      assert.equal(rows.find(r=>r.id==='1000').comment,'수정한 API 합성 리뷰'); assert.equal(rows.find(r=>r.id==='1000').authorRemoved,true)
      assert.equal(await list.getByText('수정한 API 합성 리뷰',{exact:true}).count(),0)
      await list.getByRole('group',{name:'조회 기간'}).getByRole('button',{name:'전체',exact:true}).click()
      await list.locator('.history-card').first().waitFor()
      for(let n=0;n<2;n++){const more=list.getByRole('button',{name:'리뷰 더 보기',exact:true});await more.scrollIntoViewIfNeeded();await page.waitForFunction(min=>document.querySelectorAll('.history-reviews .history-card').length>=min,(n+2)*10>26?26:(n+2)*10)}
      assert.equal(await list.locator('.history-card').count(),26)
      assert.ok(mineReads.some(r=>r.cursor==='10') && mineReads.some(r=>r.cursor==='20'))
      await list.getByRole('button',{name:'날짜 직접 선택'}).click()
      await list.getByLabel('시작일',{exact:true}).fill('2026-08-03');await list.getByLabel('종료일',{exact:true}).fill('2026-08-03');await list.getByRole('button',{name:'적용하기'}).click()
      await list.getByText('40일 전 합성 리뷰',{exact:true}).waitFor();assert.equal(await list.locator('.history-card').count(),1)
      await page.screenshot({path:path.join(output,`api-history-${width}.png`)})
      if(width<600){await list.getByRole('button',{name:'내 리뷰 닫기'}).click();await page.getByRole('navigation',{name:'하단 내비게이션'}).getByRole('button',{name:'지도',exact:true}).click()}
      else await page.getByRole('dialog',{name:'내 리뷰',exact:true}).getByRole('button',{name:'닫기',exact:true}).click()
      await card.getByRole('button',{name:'리뷰',exact:true}).click();await page.locator('.review-entry-hint').filter({hasText:'24시간'}).waitFor()
      assert.equal(await page.getByRole('dialog').count(),0)
      owner = 'another-owner'
      await page.reload({waitUntil:'networkidle'})
      if(width<600){await page.getByRole('navigation',{name:'하단 내비게이션'}).getByRole('button',{name:'내 페이지',exact:true}).click()}
      else await page.getByRole('button',{name:'전체 메뉴',exact:true}).click()
      await page.getByRole('button',{name:'내 리뷰',exact:true}).click();await list.getByText('이 기간에 남긴 리뷰가 없어요',{exact:true}).waitFor()
      assert.equal(await list.locator('.history-card').count(),0)
      assert.equal(patches,1);assert.equal(detaches,2);assert.equal(blockedWrites,0);assert.deepEqual(errors,[])
      console.log(`PASS API UI ${width}: disabled fail-closed, lost response, reload persistence, duplicate navigation without GPS, versioned edit, confirmed detach, dates/cursors, owner isolation; no live business writes`)
      await context.close()
    }
  } finally { await browser.close() }
})().catch(error=>{console.error(error);process.exitCode=1})
