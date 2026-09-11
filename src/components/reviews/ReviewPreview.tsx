'use client'
import { useEffect, useRef, useState } from 'react'
import { ReviewDialog, ReviewIcon, ReviewModal } from './ReviewDialog'
import { canManageReview, waitLabel, type Review, type ReviewInput } from '../../lib/review'

const TOILET = '월드컵경기장역'
type View = 'map' | 'account' | 'mine'
type LocationMode = 'near' | 'far' | 'inaccurate' | 'denied'
const date = (stamp: string) => new Date(stamp).toLocaleDateString('ko-KR')

export function ReviewPreview() {
  const [view,setView]=useState<View>('map')
  const [reviews,setReviews]=useState<Review[]>([])
  const [loggedIn,setLoggedIn]=useState(true)
  const [login,setLogin]=useState(false)
  const [location,setLocation]=useState<LocationMode>('near')
  const [mode,setMode]=useState<'single'|'list'>('single')
  const [editor,setEditor]=useState<'new'|Review|null>(null)
  const [selected,setSelected]=useState<Review|null>(null)
  const [remove,setRemove]=useState(false)
  const [notice,setNotice]=useState('')
  const [consent,setConsent]=useState(false)
  const [confirmLocation,setConfirmLocation]=useState(false)
  const [expired,setExpired]=useState(false)
  const [saveFailure,setSaveFailure]=useState(false)
  const [saved,setSaved]=useState(false)
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null)
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current)},[])
  const tell=(text:string)=>{if(timer.current)clearTimeout(timer.current);setNotice(text);timer.current=setTimeout(()=>setNotice(''),3500)}
  const checkLocation=()=>{
    const message={near:'',far:'화장실에서 150m 안에 있어야 리뷰 작성이 가능합니다.',inaccurate:'위치 오차가 커요. 정확한 위치를 켜고 다시 확인해 주세요.',denied:'현재 위치 권한을 허용해야 리뷰를 작성할 수 있어요.'}[location]
    if(message){tell(message);return false} return true
  }
  const start=()=>{setNotice('');if(!loggedIn){setLogin(true);return}if(!checkLocation())return;if(!consent){setConfirmLocation(true);return}setEditor('new')}
  const save=async(value:ReviewInput)=>{
    if(saveFailure)throw new Error('synthetic save failure')
    if(!loggedIn)throw new Error('test session ended')
    if(editor==='new') {
      if(!checkLocation())throw new Error('test location denied')
      const now=new Date().toISOString()
      setReviews(items=>[{...value,id:crypto.randomUUID(),toiletId:13531,toiletName:TOILET,createdAt:now,updatedAt:now,authorRemoved:false},...items])
    } else if(editor) {
      if(expired||!canManageReview(editor))throw new Error('test edit expired')
      setReviews(items=>items.map(item=>item.id===editor.id?{...item,...value,updatedAt:new Date().toISOString()}:item))
    }
    setEditor(null);setSelected(null);setSaved(true)
  }
  const rating=reviews.length?(reviews.reduce((sum,r)=>sum+r.satisfaction,0)/reviews.length).toFixed(1):'—'
  const paper=reviews.length?Math.round(reviews.filter(r=>r.paper).length/reviews.length*100):'—'
  const latest=reviews.reduce<Review | null>((current, item)=>!current || item.updatedAt > current.updatedAt ? item : current, null)
  const mine=reviews.filter(r=>!r.authorRemoved)
  const canEdit=Boolean(selected&&!expired&&canManageReview(selected))
  return <div className="rv-preview">
    <header className="rv-preview-header"><button className="brand" onClick={()=>setView('map')} aria-label="급똥 지도">급똥</button><span>리뷰 디자인 프리뷰</span><button className="rv-test-login" onClick={()=>{setLoggedIn(!loggedIn);setEditor(null);setSelected(null)}}>{loggedIn?'테스트 로그아웃':'테스트 로그인'}</button></header>
    <main className="rv-preview-main">
      <div className="rv-preview-notice"><b>디자인 체험용</b><span>실제 위치·로그인·DB를 사용하지 않아요. 입력은 이 화면에만 남고 새로고침하면 초기화돼요.</span></div>
      {view==='map'?<>
        <div className="rv-preview-heading"><div><span>REVIEW EXPERIENCE</span><h1>잠깐의 기록,<br/>다음 사람의 안심.</h1><p>제보는 시설 정보, 리뷰는 이용 경험을 남겨요.</p></div><div className="rv-card-mode"><button aria-pressed={mode==='single'} onClick={()=>setMode('single')}>단일 카드</button><button aria-pressed={mode==='list'} onClick={()=>setMode('list')}>목록 상세</button></div></div>
        <div className="rv-map-demo"><span className="rv-map-road one"/><span className="rv-map-road two"/><span className="rv-map-road three"/><span className="rv-map-label">월드컵경기장역 · 가상 지도</span><span className="rv-map-pin"><ReviewIcon name="check" size={20}/></span>
          <article className="rv-toilet-card">
            {mode==='list'&&<div className="rv-list-context"><span>이 지역 화장실</span><span>1 / 3</span></div>}
            <div className="rv-card-heading"><div><span className="rv-card-tag">도시철도 · 대전</span><h2>{TOILET}</h2></div><button className="rv-report-entry" aria-label="시설 정보 제보" onClick={()=>tell('사이렌 버튼은 기존 시설 정보 제보로 연결될 자리예요. 실제 제보는 접수하지 않아요.')}><ReviewIcon name="siren" size={19}/><span>제보</span></button></div>
            <p className="rv-opening">개방시간 <b>역사 운영시간 내</b><span>80m · 예시 거리</span></p>
            <div className="rv-metrics"><div><span><ReviewIcon name="star" size={17}/>평점</span><strong>{rating}<small> / 5.0</small></strong></div><div><span><ReviewIcon name="people" size={17}/>혼잡도</span><strong>{latest?(latest.waitMinutes>0?'대기':'원활'):'정보 없음'}</strong></div><div><span><ReviewIcon name="paper" size={17}/>휴지 있음</span><strong>{paper}<small>%</small></strong></div><button onClick={start} className="rv-review-entry"><ReviewIcon name="review" size={17}/><span>리뷰</span></button></div>
            <div className="rv-address"><span>주소</span><span>대전광역시 유성구 월드컵경기장역</span><button aria-label="예시 주소 복사" onClick={()=>tell('주소 복사 버튼 위치 예시예요.')}>복사</button></div>
            <p className="rv-stat-note">체험 리뷰 {reviews.length}개 기준 · 실제 서비스 통계가 아니에요.</p>
          </article>
        </div>
        <details className="rv-sandbox"><summary>프리뷰 시나리오 설정</summary><label>위치 확인 결과<select value={location} onChange={e=>setLocation(e.target.value as LocationMode)}><option value="near">150m 안 · 정확도 양호</option><option value="far">150m 밖</option><option value="inaccurate">정확도 부족</option><option value="denied">위치 권한 거부</option></select></label><label className="rv-test-check"><input type="checkbox" checked={saveFailure} onChange={e=>setSaveFailure(e.target.checked)}/>저장 실패 시험</label><p>GPS 위조 방지나 실제 방문 인증을 시험하는 화면이 아니에요.</p></details>
      </>:view==='account'?<section className="rv-account"><h1>내 페이지</h1><div className="rv-account-profile"><span className="rv-avatar">나</span><div><small>프리뷰 계정</small><h2>{loggedIn?'리뷰 체험 사용자':'로그인이 필요해요'}</h2></div></div><div className="rv-account-links"><button onClick={()=>loggedIn?setView('mine'):setLogin(true)}><ReviewIcon name="review"/><span>내 리뷰</span><b>{loggedIn?mine.length:''}</b><span>›</span></button><button onClick={()=>tell('내 제보는 기존 기능을 유지해요. 이 화면에서는 체험하지 않아요.')}><ReviewIcon name="siren"/><span>내 제보</span><span>›</span></button><button onClick={()=>tell('기존 계정 관리 기능은 변경하지 않아요.')}><span>계정 관리 · 동의 내역</span><span>›</span></button></div></section>:<section className="rv-my-reviews"><button className="rv-text-back" onClick={()=>setView('account')}><ReviewIcon name="back" size={18}/>내 페이지</button><div className="rv-my-heading"><h1>내 리뷰</h1><span>{mine.length}개</span></div><p>내가 남긴 이용 경험을 한곳에서 확인해요.</p>{!loggedIn?<button className="rv-primary" onClick={()=>setLogin(true)}>테스트 로그인</button>:!mine.length?<div className="rv-empty"><ReviewIcon name="review" size={36}/><h2>첫 리뷰를 기다리고 있어요</h2><p>화장실을 이용한 뒤 짧은 후기를 남겨보세요.</p><button className="rv-primary" onClick={()=>setView('map')}>화장실 카드로</button></div>:mine.map(review=><button className="rv-my-item" key={review.id} onClick={()=>setSelected(review)}><span className="rv-my-top"><strong>{review.toiletName}</strong><span>›</span></span><span className="rv-my-stars">★ {review.satisfaction}.0 <small>청결 {review.cleanliness}.0 · 휴지 {review.paper?'있음':'없음'}</small></span><span className="rv-my-comment">{review.comment||'별점과 선택 항목으로 남긴 리뷰예요.'}</span><span className="rv-my-meta">{date(review.createdAt)}<b>{!expired&&canManageReview(review)?'수정 가능':'7일 경과 · 읽기 전용'}</b></span></button>)}<label className="rv-test-check"><input type="checkbox" checked={expired} onChange={e=>setExpired(e.target.checked)}/>프리뷰: 작성 후 7일 경과 시험</label></section>}
      {!!reviews.filter(r=>r.authorRemoved).length&&view==='map'&&<section className="rv-retained"><h2>작성자 정보를 지운 체험 리뷰</h2>{reviews.filter(r=>r.authorRemoved).map(r=><article key={r.id}><strong>탈퇴한 사용자</strong><span>★ {r.satisfaction}.0 · 청결 {r.cleanliness}.0 · 휴지 {r.paper?'있음':'없음'}</span><p>{r.comment||'내용 없음'}</p></article>)}</section>}
    </main>
    <nav className="rv-preview-nav" aria-label="프리뷰 내비게이션"><button aria-current={view==='map'?'page':undefined} onClick={()=>setView('map')}><span>⌖</span>지도</button><button onClick={()=>tell('준비 중이에요')}><ReviewIcon name="people"/>커뮤니티</button><button onClick={()=>tell('알림은 기존 기능을 유지해요.')}><ReviewIcon name="siren"/>알림</button><button aria-current={view!=='map'?'page':undefined} onClick={()=>setView('account')}><span>◎</span>내 페이지</button></nav>
    <div className="rv-toast" role="status" aria-live="polite">{notice&&<span>{notice}</span>}</div>
    {login&&<ReviewModal title="로그인 · 간편가입" onClose={()=>setLogin(false)}><div className="rv-login-demo"><span className="brand">급똥</span><h1>이용 경험을 남겨주세요</h1><p>운영에서는 기존 Google·Kakao 로그인으로 연결해요. 지금은 실제 계정 없이 화면만 체험할 수 있어요.</p><button className="rv-primary rv-full" onClick={()=>{setLoggedIn(true);setLogin(false);tell('체험 계정으로 전환했어요. 리뷰 버튼을 다시 눌러주세요.')}}>프리뷰 계정으로 체험</button></div></ReviewModal>}
    {confirmLocation&&<ReviewModal title="가까이에서 남기는 리뷰" onClose={()=>setConfirmLocation(false)} footer={<button className="rv-primary rv-full" onClick={()=>{setConsent(true);setConfirmLocation(false);if(checkLocation())setEditor('new')}}>확인하고 리뷰 쓰기</button>}><div className="rv-location-intro"><span className="rv-location-symbol">⌖</span><h1>이용한 곳 가까이에서<br/>솔직한 후기를 남겨요.</h1><p>운영에서는 작성 자격 확인을 위해 현재 위치를 사용해요. 화장실에서 <b>150m 이내</b>, 위치 정확도 <b>50m 이하</b>여야 해요.</p><p className="rv-retention-note">지금은 디자인 체험으로 실제 위치를 요청하거나 서버에 보내지 않아요. 정식 위치 이용 고지는 출시 전에 확정합니다.</p></div></ReviewModal>}
    {editor&&<ReviewDialog toiletName={TOILET} initial={editor==='new'?undefined:editor} onClose={()=>setEditor(null)} onSave={save}/>}
    {saved&&<ReviewModal title="리뷰를 남겼어요" onClose={()=>setSaved(false)} footer={<div className="rv-two-actions"><button className="rv-secondary" onClick={()=>setSaved(false)}>카드로 돌아가기</button><button className="rv-primary" onClick={()=>{setSaved(false);setView('mine')}}>내 리뷰 보기</button></div>}><div className="rv-complete"><span><ReviewIcon name="check" size={34}/></span><h1>덕분에 더 안심할 수 있어요</h1><p>별점과 이용 경험이 체험 화면에 반영됐어요.</p><small>프리뷰 데이터 · 실제 리뷰 DB 저장 아님</small></div></ReviewModal>}
    {selected&&<ReviewModal title={remove?'작성자 정보 지우기':'내 리뷰 상세'} onClose={()=>{setSelected(null);setRemove(false)}} onBack={remove?()=>setRemove(false):()=>setSelected(null)} footer={remove?<div className="rv-two-actions"><button className="rv-secondary" onClick={()=>setRemove(false)}>취소</button><button className="rv-danger" onClick={()=>{if(!canEdit)return;setReviews(items=>items.map(r=>r.id===selected.id?{...r,authorRemoved:true}:r));setSelected(null);setRemove(false);tell('작성자 정보만 지웠어요. 리뷰 내용과 평가는 남아 있어요.')}}>정보 지우기</button></div>:canEdit?<div className="rv-two-actions"><button className="rv-secondary" onClick={()=>setRemove(true)}>작성자 정보 지우기</button><button className="rv-primary" onClick={()=>{setEditor(selected);setSelected(null)}}>수정하기</button></div>:<p className="rv-deadline">작성 후 7일이 지나 수정·작성자 정보 지우기가 종료됐어요.</p>}>
      {remove?<div className="rv-delete-copy"><h1>리뷰는 그대로 남아요</h1><p>별점, 화장지 유무, 대기시간, <b>작성한 글은 삭제되지 않아요.</b> 작성자만 ‘탈퇴한 사용자’로 표시됩니다.</p><p>내 리뷰에서 사라지고 다시 수정하거나 연결을 복구할 수 없어요. <b>급똥 회원 탈퇴는 아닙니다.</b></p></div>:<div className="rv-full-review"><span className="rv-card-tag">내 이용 기록</span><h1>{selected.toiletName}</h1><span className="rv-review-date">{date(selected.createdAt)}</span><dl><div><dt>만족도</dt><dd>★ {selected.satisfaction}.0</dd></div><div><dt>청결도</dt><dd>★ {selected.cleanliness}.0</dd></div><div><dt>화장지</dt><dd>{selected.paper?'있었어요':'없었어요'}</dd></div><div><dt>대기시간</dt><dd>{waitLabel(selected.waitMinutes)}</dd></div></dl><p className="rv-full-comment">{selected.comment||'작성한 내용이 없어요.'}</p><p className="rv-retention-note">수정 가능 기한: {date(new Date(Date.parse(selected.createdAt)+7*86400000).toISOString())}까지 · 최초 작성 시각 기준</p></div>}
    </ReviewModal>}
  </div>
}
