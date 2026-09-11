'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { ReviewDialog, ReviewIcon, ReviewModal } from './ReviewDialog'
import { canManageReview, congestionLabel, waitLabel, type Review, type ReviewInput } from '../../lib/review'

export const REVIEW_DESIGN_PREVIEW = process.env.NEXT_PUBLIC_REVIEW_DESIGN_PREVIEW === 'true'
type Target = { id: number; name: string }
export type PreviewReviewSummary = { count: number; rating: string; paper: number; congestion: string }
const displayDate = (value: string) => new Date(value).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })

/** Preview-only memory store. Never changes real auth, requests GPS, or writes to an API. */
export function useIntegratedReviewPreview(owner: string) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [target, setTarget] = useState<Target | null>(null)
  const [editing, setEditing] = useState<Review | null>(null)
  const [mine, setMine] = useState(false)
  const [selected, setSelected] = useState<Review | null>(null)
  const [removing, setRemoving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState('')
  const ownerRef = useRef(owner)
  useLayoutEffect(() => {
    if (ownerRef.current === owner) return
    ownerRef.current = owner
    setReviews([]); setTarget(null); setEditing(null); setMine(false)
    setSelected(null); setRemoving(false); setSaved(false); setMessage('')
  }, [owner])

  const open = (next: Target) => {
    if (!REVIEW_DESIGN_PREVIEW) return
    setTarget({ id: next.id, name: next.name }); setEditing(null)
    setSelected(null); setRemoving(false); setMine(false); setMessage('')
  }
  const openMine = () => { if (REVIEW_DESIGN_PREVIEW) { setMine(true); setTarget(null); setSelected(null); setSaved(false); setRemoving(false) } }
  const close = () => { setTarget(null); setEditing(null); setMine(false); setSelected(null); setSaved(false); setRemoving(false); setMessage('') }
  const save = async (value: ReviewInput) => {
    if (!REVIEW_DESIGN_PREVIEW || !target || ownerRef.current !== owner) throw new Error('Preview session changed')
    if (editing && !canManageReview(editing)) throw new Error('Preview edit window expired')
    const now = new Date().toISOString()
    setReviews(items => editing
      ? items.map(item => item.id === editing.id ? { ...item, ...value, updatedAt: now } : item)
      : [{ ...value, id: crypto.randomUUID(), toiletId: target.id, toiletName: target.name, createdAt: now, updatedAt: now, authorRemoved: false }, ...items].slice(0, 100))
    setTarget(null); setEditing(null); setSelected(null); setSaved(true)
  }
  const summary = (toiletId: number): PreviewReviewSummary | undefined => {
    const items = reviews.filter(item => item.toiletId === toiletId)
    if (!items.length) return undefined
    const congestion = items.find(item => item.congestion)?.congestion ?? ''
    return { count: items.length, rating: (items.reduce((n, item) => n + item.satisfaction, 0) / items.length).toFixed(1), paper: Math.round(items.filter(item => item.paper).length / items.length * 100), congestion: congestion ? congestionLabel(congestion) : '미선택' }
  }
  const mineItems = reviews.filter(item => !item.authorRemoved)
  const manageable = selected && canManageReview(selected)
  const modal = !REVIEW_DESIGN_PREVIEW ? null : target ? <ReviewDialog key={`${owner}:${editing?.id ?? target.id}`} previewNotice toiletName={target.name} initial={editing ?? undefined} onClose={() => { setTarget(null); setEditing(null) }} onSave={save} />
    : saved ? <ReviewModal title="리뷰를 저장했어요" onClose={close} footer={<div className="rv-two-actions"><button className="rv-secondary" onClick={close}>카드로 돌아가기</button><button className="rv-primary" onClick={openMine}>내 리뷰 보기</button></div>}><div className="rv-complete"><span><ReviewIcon name="check" size={32} /></span><h1>이용 경험을 남겼어요</h1><p>선택한 화장실 카드에 체험 평가가 반영됐어요.</p><small>프리뷰 메모리 저장 · 실제 DB에 저장되지 않아요.</small></div></ReviewModal>
    : mine ? <ReviewModal title={removing ? '작성자 정보 지우기' : selected ? '내 리뷰 상세' : '내 리뷰'} onClose={close} onBack={selected ? () => { if (removing) setRemoving(false); else setSelected(null) } : undefined}
      footer={selected ? removing ? <div className="rv-two-actions"><button className="rv-secondary" onClick={() => setRemoving(false)}>취소</button><button className="rv-danger" disabled={!manageable} onClick={() => {
        if (!canManageReview(selected) || ownerRef.current !== owner) return
        setReviews(items => items.map(item => item.id === selected.id ? { ...item, authorRemoved: true } : item))
        setSelected(null); setRemoving(false); setMessage('작성자 정보만 지웠어요. 글과 평가는 남고, 내 리뷰에서는 제외됐어요.')
      }}>정보 지우기</button></div> : manageable ? <div className="rv-two-actions"><button className="rv-secondary" onClick={() => setRemoving(true)}>작성자 정보 지우기</button><button className="rv-primary" onClick={() => { setEditing(selected); setTarget({ id: selected.toiletId, name: selected.toiletName }) }}>수정하기</button></div> : <p className="rv-deadline">작성 후 7일이 지나 수정·작성자 정보 지우기가 종료됐어요.</p> : undefined}>
      {removing ? <div className="rv-delete-copy"><h1>리뷰는 그대로 남아요</h1><p>별점·화장지 유무·혼잡도와 <b>작성한 글은 삭제되지 않아요.</b> 작성자만 ‘탈퇴한 사용자’로 표시됩니다.</p><p>내 리뷰에서 사라지고 다시 수정하거나 연결을 복구할 수 없어요. <b>급똥 회원 탈퇴는 아닙니다.</b></p></div>
        : selected ? <div className="rv-full-review"><span className="rv-card-tag">내 이용 기록 · 프리뷰</span><h1>{selected.toiletName}</h1><span className="rv-review-date">{displayDate(selected.createdAt)}</span><dl>
          <div><dt>만족도</dt><dd>★ {selected.satisfaction}.0</dd></div><div><dt>청결도</dt><dd>★ {selected.cleanliness}.0</dd></div><div><dt>화장지</dt><dd>{selected.paper ? '있었어요' : '없었어요'}</dd></div><div><dt>혼잡도</dt><dd>{congestionLabel(selected.congestion)}{['WAITING', 'CROWDED'].includes(selected.congestion) ? ` · ${waitLabel(selected.waitMinutes)}` : ''}</dd></div>
        </dl><p className="rv-full-comment">{selected.comment || '작성한 내용이 없어요.'}</p><p className="rv-retention-note">수정 가능 기한: {displayDate(new Date(Date.parse(selected.createdAt) + 7 * 86400000).toISOString())} · 최초 작성 기준</p></div>
          : <><p className="rv-integrated-notice">리뷰 디자인 프리뷰 · 이 화면에서 작성한 체험 리뷰만 보여요. 실제 계정 데이터가 아니며 새로고침·계정 전환 시 초기화돼요.</p>{message && <p className="rv-retention-note" role="status">{message}</p>}
            {!mineItems.length ? <div className="rv-empty"><ReviewIcon name="review" size={34} /><h2>아직 남긴 리뷰가 없어요</h2><p>지도에서 화장실을 선택하고 리뷰를 남겨보세요.</p><button className="rv-primary" onClick={close}>확인</button></div>
              : mineItems.map(item => <button className="rv-my-item" key={item.id} onClick={() => setSelected(item)}><span className="rv-my-top"><strong>{item.toiletName}</strong><span>›</span></span><span className="rv-my-stars">★ {item.satisfaction}.0 <small>청결 {item.cleanliness}.0 · 휴지 {item.paper ? '있음' : '없음'}</small></span><span className="rv-my-comment">{item.comment || '별점과 선택 항목으로 남긴 리뷰예요.'}</span><span className="rv-my-meta">{displayDate(item.createdAt)}<b>{canManageReview(item) ? '수정 가능' : '7일 경과'}</b></span></button>)}</>}
    </ReviewModal> : null
  return { open, openMine, close, summary, modal, active: Boolean(target || mine || saved) }
}
