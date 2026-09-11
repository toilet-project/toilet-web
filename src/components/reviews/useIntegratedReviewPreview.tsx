'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ReviewDialog, ReviewIcon, ReviewModal, type ReviewEligibility } from './ReviewDialog'
import { canManageReview, congestionLabel, waitLabel, type Review, type ReviewInput } from '../../lib/review'
import { requireReviewLocation, ReviewGateError, type ReviewPoint } from '../../lib/reviewLocation'

export const REVIEW_DESIGN_PREVIEW = process.env.NEXT_PUBLIC_REVIEW_DESIGN_PREVIEW === 'true'
type Target = { id: number; name: string } & ReviewPoint
type LocatedReview = Review & ReviewPoint
type Access = { requireLogin: () => void; verifySession: (isCurrent: () => boolean) => Promise<boolean> }
export type PreviewReviewSummary = { count: number; rating: string; paper: number; congestion: string }
const displayDate = (value: string) => new Date(value).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })

/** Real session/GPS eligibility, but reviews remain preview-only memory data. */
export function useIntegratedReviewPreview(owner: string | null, access: Access) {
  const [reviews, setReviews] = useState<LocatedReview[]>([])
  const [target, setTarget] = useState<Target | null>(null)
  const [editing, setEditing] = useState<LocatedReview | null>(null)
  const [mine, setMine] = useState(false)
  const [selected, setSelected] = useState<LocatedReview | null>(null)
  const [removing, setRemoving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState('')
  const [checking, setChecking] = useState(false)
  const [mineError, setMineError] = useState('')
  const [eligibility, setEligibility] = useState<ReviewEligibility>({ status: 'checking', message: '현재 위치와 로그인을 확인하고 있어요.' })
  const request = useRef(0)
  useEffect(() => () => { request.current++ }, [])
  const ownerRef = useRef(owner)
  useLayoutEffect(() => {
    if (ownerRef.current === owner) return
    ownerRef.current = owner
    request.current++; setChecking(false)
    setReviews([]); setTarget(null); setEditing(null); setMine(false)
    setSelected(null); setRemoving(false); setSaved(false); setMessage('')
  }, [owner])

  const session = async (token: number) => {
    if (!owner || ownerRef.current !== owner) throw new ReviewGateError('로그인 후 리뷰를 이용해 주세요.')
    let valid = false
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    try { valid = await Promise.race([access.verifySession(() => active && token === request.current && ownerRef.current === owner), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Session check timed out')), 12_000) })]) }
    catch { throw new ReviewGateError('로그인 상태를 확인하지 못했어요. 인터넷 연결을 확인해 주세요.') }
    finally { active = false; clearTimeout(timer) }
    if (!valid || ownerRef.current !== owner) throw new ReviewGateError('로그인을 다시 확인한 뒤 리뷰를 눌러 주세요.')
  }
  const checkEligibility = async (next: Target, fresh = false) => {
    const token = ++request.current
    let locationDone = false, sessionDone = false, failed = false
    const progress = () => {
      if (token !== request.current || failed) return
      setEligibility({ status: 'checking', message: !locationDone && !sessionDone ? '현재 위치와 로그인을 확인하고 있어요.' : !locationDone ? '현재 위치를 확인하고 있어요. 먼저 별점을 골라보세요.' : '로그인 상태를 확인하고 있어요.' })
    }
    progress()
    try {
      const [, measuredAt] = await Promise.all([
        session(token).then(() => { sessionDone = true; progress() }),
        requireReviewLocation(next, { fresh }).then(timestamp => { locationDone = true; progress(); return timestamp }),
      ])
      if (token !== request.current || ownerRef.current !== owner) return
      if (Date.now() - measuredAt > 60_000) throw new ReviewGateError('위치 확인 후 시간이 지났어요. 다시 확인해 주세요.')
      setEligibility({ status: 'ready', message: '' })
    } catch (error) {
      failed = true
      if (token === request.current) setEligibility({ status: 'blocked', message: error instanceof ReviewGateError ? error.message : '위치를 확인하지 못했어요. 다시 시도해 주세요.' })
    }
  }
  const open = (next: Target) => {
    if (!REVIEW_DESIGN_PREVIEW) return
    if (!owner) { access.requireLogin(); return }
    // Draft UI is immediate; registration stays disabled until both checks pass.
    setTarget({ id: next.id, name: next.name, latitude: next.latitude, longitude: next.longitude }); setEditing(null)
    setSelected(null); setRemoving(false); setMine(false); setSaved(false); setMessage('')
    void checkEligibility(next)
  }
  const openMine = async () => {
    if (!REVIEW_DESIGN_PREVIEW) return
    if (!owner) { access.requireLogin(); return }
    const token = ++request.current
    setMine(true); setMineError(''); setTarget(null); setSelected(null); setSaved(false); setRemoving(false)
    setChecking(true)
    try {
      await session(token)
      if (token !== request.current) return
      setMine(true); setTarget(null); setSelected(null); setSaved(false); setRemoving(false)
    } catch (error) { if (token === request.current) setMineError(error instanceof ReviewGateError ? error.message : '로그인을 확인해 주세요.') }
    finally { if (token === request.current) setChecking(false) }
  }
  const close = () => { request.current++; setChecking(false); setTarget(null); setEditing(null); setMine(false); setSelected(null); setSaved(false); setRemoving(false); setMessage('') }
  const save = async (value: ReviewInput) => {
    if (!REVIEW_DESIGN_PREVIEW || !target || ownerRef.current !== owner) throw new Error('Preview session changed')
    if (!editing && eligibility.status !== 'ready') throw new ReviewGateError('로그인과 위치 확인을 먼저 완료해 주세요.')
    if (editing && !canManageReview(editing)) throw new Error('Preview edit window expired')
    const token = ++request.current
    // Recheck both in parallel; browser cache never extends a fix's original timestamp.
    // Editing a previously verified review only requires the same signed-in author within seven days.
    const [, measuredAt] = await Promise.all([session(token), !editing ? requireReviewLocation(target) : Promise.resolve(null)])
    if (token !== request.current || ownerRef.current !== owner) throw new ReviewGateError('로그인이 변경됐어요. 다시 확인해 주세요.')
    if (measuredAt !== null && Date.now() - measuredAt > 60_000) throw new ReviewGateError('위치 확인 후 시간이 지났어요. 다시 저장해 주세요.')
    if (editing && !canManageReview(editing)) throw new ReviewGateError('작성 후 7일이 지나 수정할 수 없어요.')
    const now = new Date().toISOString()
    setReviews(items => editing
      ? items.map(item => item.id === editing.id ? { ...item, ...value, updatedAt: now } : item)
      : [{ ...value, latitude: target.latitude, longitude: target.longitude, id: crypto.randomUUID(), toiletId: target.id, toiletName: target.name, createdAt: now, updatedAt: now, authorRemoved: false }, ...items].slice(0, 100))
    setTarget(null); setEditing(null); setSelected(null); setSaved(true)
  }
  const summary = (toiletId: number): PreviewReviewSummary | undefined => {
    const items = reviews.filter(item => item.toiletId === toiletId)
    if (!items.length) return undefined
    const congestion = items.find(item => item.congestion)?.congestion ?? ''
    return { count: items.length, rating: String(Number((items.reduce((n, item) => n + item.satisfaction, 0) / items.length).toFixed(1))), paper: Math.round(items.filter(item => item.paper).length / items.length * 100), congestion: congestion ? congestionLabel(congestion) : '미선택' }
  }
  const mineItems = reviews.filter(item => !item.authorRemoved)
  const manageable = selected && canManageReview(selected)
  const modal = !REVIEW_DESIGN_PREVIEW ? null : target ? <ReviewDialog key={`${owner}:${editing?.id ?? target.id}`} toiletName={target.name} initial={editing ?? undefined} onClose={close} onSave={save} eligibility={editing ? undefined : eligibility} onRetryEligibility={editing ? undefined : () => { void checkEligibility(target, true) }} />
    : saved ? <ReviewModal title="리뷰를 저장했어요" onClose={close} footer={<div className="rv-two-actions"><button className="rv-secondary" onClick={close}>카드로 돌아가기</button><button className="rv-primary" onClick={openMine}>내 리뷰 보기</button></div>}><div className="rv-complete"><span><ReviewIcon name="check" size={32} /></span><h1>이용 경험을 남겼어요</h1><p>선택한 화장실 카드에 체험 평가가 반영됐어요.</p><small>프리뷰 메모리 저장 · 실제 DB에 저장되지 않아요.</small></div></ReviewModal>
    : mine ? <ReviewModal title={removing ? '작성자 정보 지우기' : selected ? '내 리뷰 상세' : '내 리뷰'} onClose={close} onBack={selected ? () => { if (removing) setRemoving(false); else setSelected(null) } : undefined}
      footer={selected ? removing ? <div className="rv-two-actions"><button className="rv-secondary" onClick={() => setRemoving(false)}>취소</button><button className="rv-danger" disabled={!manageable} onClick={() => {
        if (!canManageReview(selected) || ownerRef.current !== owner) return
        setReviews(items => items.map(item => item.id === selected.id ? { ...item, authorRemoved: true } : item))
        setSelected(null); setRemoving(false); setMessage('작성자 정보만 지웠어요. 글과 평가는 남고, 내 리뷰에서는 제외됐어요.')
      }}>정보 지우기</button></div> : manageable ? <div className="rv-two-actions"><button className="rv-secondary" onClick={() => setRemoving(true)}>작성자 정보 지우기</button><button className="rv-primary" onClick={() => { setEditing(selected); setTarget({ id: selected.toiletId, name: selected.toiletName, latitude: selected.latitude, longitude: selected.longitude }) }}>수정하기</button></div> : <p className="rv-deadline">작성 후 7일이 지나 수정·작성자 정보 지우기가 종료됐어요.</p> : undefined}>
      {removing ? <div className="rv-delete-copy"><h1>리뷰는 그대로 남아요</h1><p>별점·화장지 유무·혼잡도와 <b>작성한 글은 삭제되지 않아요.</b> 작성자만 ‘탈퇴한 사용자’로 표시됩니다.</p><p>내 리뷰에서 사라지고 다시 수정하거나 연결을 복구할 수 없어요. <b>급똥 회원 탈퇴는 아닙니다.</b></p></div>
        : selected ? <div className="rv-full-review"><span className="rv-card-tag">내 이용 기록 · 프리뷰</span><h1>{selected.toiletName}</h1><span className="rv-review-date">{displayDate(selected.createdAt)}</span><dl>
          <div><dt>만족도</dt><dd>★ {selected.satisfaction} / 5</dd></div><div><dt>청결도</dt><dd>★ {selected.cleanliness} / 5</dd></div><div><dt>화장지</dt><dd>{selected.paper ? '있었어요' : '없었어요'}</dd></div><div><dt>혼잡도</dt><dd>{congestionLabel(selected.congestion)}{['WAITING', 'CROWDED'].includes(selected.congestion) ? ` · ${waitLabel(selected.waitMinutes)}` : ''}</dd></div>
        </dl><p className="rv-full-comment">{selected.comment || '작성한 내용이 없어요.'}</p><p className="rv-retention-note">수정 가능 기한: {displayDate(new Date(Date.parse(selected.createdAt) + 7 * 86400000).toISOString())} · 최초 작성 기준</p></div>
          : checking ? <p className="rv-retention-note" role="status">로그인 상태를 확인하고 있어요.</p> : mineError ? <div className="rv-error" role="alert">{mineError}<button type="button" className="rv-eligibility-retry" onClick={openMine}>다시 확인</button></div> : <>{message && <p className="rv-retention-note" role="status">{message}</p>}
            {!mineItems.length ? <div className="rv-empty"><ReviewIcon name="review" size={34} /><h2>아직 남긴 리뷰가 없어요</h2><p>지도에서 화장실을 선택하고 리뷰를 남겨보세요.</p><button className="rv-primary" onClick={close}>확인</button></div>
              : mineItems.map(item => <button className="rv-my-item" key={item.id} onClick={() => setSelected(item)}><span className="rv-my-top"><strong>{item.toiletName}</strong><span>›</span></span><span className="rv-my-stars">★ {item.satisfaction} / 5 <small>청결 {item.cleanliness} / 5 · 휴지 {item.paper ? '있음' : '없음'}</small></span><span className="rv-my-comment">{item.comment || '별점과 선택 항목으로 남긴 리뷰예요.'}</span><span className="rv-my-meta">{displayDate(item.createdAt)}<b>{canManageReview(item) ? '수정 가능' : '7일 경과'}</b></span></button>)}</>}
    </ReviewModal> : null
  return { open, openMine, close, summary, modal, active: Boolean(target || mine || saved || checking) }
}
