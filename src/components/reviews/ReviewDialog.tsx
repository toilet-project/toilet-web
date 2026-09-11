'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useDialogFocus } from '../../lib/useDialogFocus'
import { attachReportViewport } from '../../lib/reportViewport'
import { attachReviewInputVisibility } from '../../lib/reviewViewport'
import { blankReview, reviewLength, validateReview, waitLabel, type ReviewInput } from '../../lib/review'
import { ReviewGateError } from '../../lib/reviewLocation'

export function ReviewIcon({ name, size = 22, className }: { name: 'star' | 'review' | 'siren' | 'paper' | 'people' | 'close' | 'back' | 'check' | 'refresh'; size?: number; className?: string }) {
  const paths: Record<typeof name, ReactNode> = {
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
    review: <><path d="M14 4H5a2 2 0 0 0-2 2v15l4-3h11a2 2 0 0 0 2-2v-5" /><path d="m13 12-4 1 1-4 7-7 3 3-7 7Z" /></>,
    siren: <><path d="M6 17v-6a6 6 0 0 1 12 0v6M4 17h16v4H4zM12 1v1M3 4l2 2M21 4l-2 2M1 11h2M21 11h2" /><path d="M12 8a3 3 0 0 1 3 3v3" /></>,
    paper: <><ellipse cx="6" cy="9" rx="3" ry="6" /><path d="M6 3h10c2.8 0 5 2.7 5 6v12H9V9M6 15h3M6 8v2M12 16h1m3 0h1" /></>,
    people: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v2" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />, back: <path d="m14 5-7 7 7 7" />, check: <path d="m5 12 4 4L19 6" />,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17" /></>,
  }
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'star' ? '1.8' : '1.7'} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function ReviewModal({ title, onClose, onBack, children, footer }: { title: string; onClose: () => void; onBack?: () => void; children: ReactNode; footer?: ReactNode }) {
  const dialog = useDialogFocus(true, onClose)
  const backdrop = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!backdrop.current) return
    const detachViewport = attachReportViewport(backdrop.current)
    const detachInput = attachReviewInputVisibility(backdrop.current)
    return () => { detachInput(); detachViewport() }
  }, [])
  return <div className="rv-backdrop" ref={backdrop} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <section className="rv-dialog" ref={dialog} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      <header className="rv-toolbar">{onBack ? <button type="button" className="rv-icon-button" onClick={onBack} aria-label="뒤로가기"><ReviewIcon name="back" /></button> : <span className="rv-toolbar-mark"><ReviewIcon name="review" size={19} /></span>}<strong>{title}</strong><button type="button" className="rv-icon-button" aria-label="닫기" onClick={onClose}><ReviewIcon name="close" /></button></header>
      <div className="rv-dialog-body">{children}</div>
      {footer && <footer className="rv-dialog-footer">{footer}</footer>}
    </section>
  </div>
}

function Stars({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <fieldset className="rv-stars-field"><legend>{label}<span className="rv-required">필수</span></legend><div className="rv-rating-line"><div className="rv-stars">
    {[1,2,3,4,5].map(n => <label key={n} className={n <= value ? 'is-filled' : ''}><input type="radio" name={label} value={n} checked={value === n} onChange={() => onChange(n)} aria-label={`${label} ${n}점`} /><ReviewIcon name="star" size={34} /></label>)}
  </div><output aria-live="polite" aria-label={`${label} ${value} / 5`}>{value} <small>/ 5</small></output></div></fieldset>
}

export type ReviewEligibility = { status: 'checking' | 'ready' | 'blocked'; message: string }

export function ReviewDialog({ toiletName, initial, onClose, onSave, eligibility, onRetryEligibility }: { toiletName: string; initial?: ReviewInput; onClose: () => void; onSave: (value: ReviewInput) => Promise<void>; eligibility?: ReviewEligibility; onRetryEligibility?: () => void }) {
  const [value, setValue] = useState<ReviewInput>(initial ?? blankReview)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [discard, setDiscard] = useState(false)
  // The card opens this editor only after verification. Rechecks retain the draft.
  const busy = useRef(false), active = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const change = <K extends keyof ReviewInput>(key: K, next: ReviewInput[K]) => { setError(''); setValue(current => ({...current, [key]: next})) }
  const dirty = JSON.stringify(value) !== JSON.stringify(initial ?? blankReview())
  const close = () => { if (busy.current) return; if (dirty) setDiscard(true); else onClose() }
  const submit = async () => {
    if (busy.current || (eligibility && eligibility.status !== 'ready')) return
    const problem=validateReview(value)
    if (problem) { setError(problem); return }
    busy.current=true; setSaving(true); setError('')
    try { await onSave({...value, comment:value.comment.trim()}) }
    catch (error) { if (active.current) setError(error instanceof ReviewGateError ? error.message : '저장하지 못했어요. 입력 내용은 유지되니 다시 시도해 주세요.') }
    finally { busy.current=false; if (active.current) setSaving(false) }
  }
  const eligibilityPending = eligibility && eligibility.status !== 'ready'
  const retry = () => { setError(''); onRetryEligibility?.() }
  return <ReviewModal title={discard ? '작성을 그만둘까요?' : initial ? '리뷰 수정' : '리뷰 쓰기'} onClose={close} onBack={discard ? () => setDiscard(false) : close} footer={discard ? <div className="rv-two-actions"><button className="rv-secondary" onClick={() => setDiscard(false)}>계속 작성</button><button className="rv-primary" onClick={onClose}>그만두기</button></div> : <>{eligibilityPending ? <div className={`rv-eligibility is-${eligibility.status}`} role={eligibility.status === 'blocked' ? 'alert' : 'status'}><span title={eligibility.message}>{eligibility.message}</span>{onRetryEligibility && <button className="rv-location-refresh" type="button" onClick={retry} disabled={eligibility.status === 'checking'} aria-label="위치 새로고침" title="위치 새로고침"><ReviewIcon name="refresh" size={18} /></button>}</div> : error ? <div role="alert" className="rv-error rv-save-error"><span>{error}</span>{onRetryEligibility && <button className="rv-location-refresh" type="button" onClick={retry} aria-label="위치 새로고침" title="위치 새로고침"><ReviewIcon name="refresh" size={18} /></button>}</div> : <span className="rv-footer-hint">별점 두 개와 화장지 유무만 선택하면 돼요</span>}<button className="rv-primary rv-full" disabled={saving || Boolean(eligibilityPending)} onClick={() => void submit()}>{saving ? '저장 중…' : initial ? '수정한 내용 저장' : '리뷰 남기기'}<ReviewIcon name="check" size={18} /></button></>}>
    {discard ? <p className="rv-discard-copy">아직 저장하지 않은 내용은 사라져요.</p> : <>
      <div className="rv-target"><span>이용한 화장실</span><h1>{toiletName}</h1></div>
      <div className="rv-required-fields">
        <Stars label="만족도" value={value.satisfaction} onChange={n=>change('satisfaction',n)} />
        <Stars label="청결도" value={value.cleanliness} onChange={n=>change('cleanliness',n)} />
        <fieldset className="rv-paper-field"><legend>화장지가 있었나요?<span className="rv-required">필수</span></legend><div className="rv-segment two">
          {[true,false].map(paper=><button type="button" key={String(paper)} data-paper={paper ? 'available' : 'missing'} aria-pressed={value.paper===paper} onClick={()=>change('paper',paper)}><ReviewIcon name="paper" size={20}/>{paper?'있었어요':'없었어요'}</button>)}
        </div></fieldset>
      </div>
      <fieldset className="rv-wait-field"><legend>대기시간<span className="rv-optional">기본 0분</span></legend><div className="rv-wait"><div className="rv-wait-heading"><label htmlFor="review-wait">얼마나 기다렸나요?</label><strong>{waitLabel(value.waitMinutes)}</strong></div><div className="rv-wait-control"><input id="review-wait" type="range" aria-label="대기시간" min="0" max="60" step="10" value={value.waitMinutes} aria-valuetext={waitLabel(value.waitMinutes)} onChange={e=>change('waitMinutes',Number(e.target.value))}/><div className="rv-wait-ticks">{[0,10,20,30,40,50,60].map(minutes=><button type="button" key={minutes} aria-label={`대기 ${waitLabel(minutes)}`} aria-pressed={value.waitMinutes===minutes} onClick={()=>change('waitMinutes',minutes)}><i aria-hidden="true"/>{minutes===60?'60+':minutes}</button>)}</div></div></div></fieldset>
      <div className="rv-comment"><label htmlFor="review-comment">한 줄 더 남겨주세요<span className="rv-optional">선택</span></label><textarea id="review-comment" rows={2} value={value.comment} onChange={e=>change('comment',Array.from(e.target.value).slice(0,200).join(''))} placeholder="예: 깨끗하고 휴지도 넉넉했어요." aria-describedby="review-comment-help"/><div className="rv-comment-foot"><span id="review-comment-help">이름·연락처 등 개인정보는 적지 말아 주세요.</span><output>{reviewLength(value.comment)} / 200</output></div></div>
      <p className="rv-retention-note">작성 후 7일 동안 수정할 수 있어요. 작성자 정보를 지워도 리뷰 내용과 평가는 남아요.</p>
    </>}
  </ReviewModal>
}
