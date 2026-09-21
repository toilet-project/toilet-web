'use client'

import { useLocale, useMessages } from '../../i18n/context'
import { reviewErrorMessage } from '../../i18n/reviewErrors'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ReviewDialog, ReviewIcon, ReviewModal, type ReviewEligibility } from './ReviewDialog'
import { canManageReview, recentToiletReview, type Review, type ReviewInput } from '../../lib/review'
import { requireReviewLocation, ReviewGateError, REVIEW_LOCATION_MAX_AGE_MS, type ReviewPoint } from '../../lib/reviewLocation'
import { isMobileReviewDevice } from '../../lib/reviewDevice'

import { MyReviewsPanel } from './MyReviewsPanel'

export const REVIEW_DESIGN_PREVIEW = process.env.NEXT_PUBLIC_REVIEW_DESIGN_PREVIEW === 'true'
export type ReviewTarget = { id: number; name: string } & ReviewPoint
type Target = ReviewTarget
type LocatedReview = Review & ReviewPoint
export type ReviewAccess = { requireLogin: () => void; verifySession: (isCurrent: () => boolean) => Promise<boolean> }
type Access = ReviewAccess
export type PreviewReviewSummary = { count: number; rating: string; paper: number | null; congestion: string; source?: 'api' }
export type ReviewEntryState = { status: 'checking' | 'retry' | 'notice'; message: string }
type Entry = ReviewEntryState & { id: number }
export type MineNavigation = { embedded: boolean; onOpen: () => void; onClose: () => void; contextKey: string; toiletId?: number }

/** Real session/GPS eligibility, but reviews remain preview-only memory data. */
export function useIntegratedReviewPreview(owner: string | null, access: Access, mineNavigation?: MineNavigation) {
  const locale = useLocale(), t = useMessages()
  const [reviews, setReviews] = useState<LocatedReview[]>([])
  const [target, setTarget] = useState<Target | null>(null)
  const [editing, setEditing] = useState<LocatedReview | null>(null)
  const [mine, setMine] = useState(false)
  const [saved, setSaved] = useState(false)
  const [existingPrompt, setExistingPrompt] = useState<LocatedReview | null>(null)
  const [message, setMessage] = useState('')
  const [checking, setChecking] = useState(false)
  const [mineError, setMineError] = useState('')
  const [mineFocus, setMineFocus] = useState<{ id?: string; visit: number }>({ visit: 0 })
  const saving = useRef(false)
  const [entry, setEntry] = useState<Entry | null>(null)
  const entryRef = useRef<Entry | null>(null)
  const updateEntry = (value: Entry | null) => { entryRef.current = value; setEntry(value) }
  const [eligibility, setEligibility] = useState<ReviewEligibility>({ status: 'checking', message: t('review.checkingAccess') })
  const request = useRef(0)
  useEffect(() => () => { request.current++ }, [])
  const ownerRef = useRef(owner)
  useLayoutEffect(() => {
    if (ownerRef.current === owner) return
    ownerRef.current = owner
    request.current++; setChecking(false); updateEntry(null)
    setReviews([]); setTarget(null); setEditing(null); setMine(false); setExistingPrompt(null)
    setSaved(false); setMessage('')
  }, [owner])
  useLayoutEffect(() => {
    // Changing/closing the selected card or leaving the map cancels late completions.
    if (entryRef.current) { request.current++; updateEntry(null) }
  }, [mineNavigation?.contextKey])

  const session = async (token: number) => {
    if (!owner || ownerRef.current !== owner) throw new ReviewGateError('로그인 후 리뷰를 이용해 주세요.', 'session')
    let valid = false
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    try { valid = await Promise.race([access.verifySession(() => active && token === request.current && ownerRef.current === owner), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Session check timed out')), 12_000) })]) }
    catch { throw new ReviewGateError('로그인 상태를 확인하지 못했어요. 인터넷 연결을 확인해 주세요.', 'session') }
    finally { active = false; clearTimeout(timer) }
    if (!valid || ownerRef.current !== owner) throw new ReviewGateError('로그인을 다시 확인한 뒤 리뷰를 눌러 주세요.', 'session')
  }
  const checkEligibility = async (next: Target, fresh = false, fromCard = false) => {
    const token = ++request.current
    let locationDone = false, sessionDone = false, failed = false
    const progress = () => {
      if (token !== request.current || failed) return
      const message = t(!locationDone && !sessionDone ? 'review.checkingAccess' : !locationDone ? 'review.checkingLocation' : 'auth.checking')
      if (fromCard) updateEntry({ id: next.id, status: 'checking', message })
      else setEligibility({ status: 'checking', message })
    }
    progress()
    try {
      const [, measuredAt] = await Promise.all([
        session(token).then(() => { sessionDone = true; progress() }),
        requireReviewLocation(next, { fresh }).then(timestamp => { locationDone = true; progress(); return timestamp }),
      ])
      if (token !== request.current || ownerRef.current !== owner) return
      if (Date.now() - measuredAt > REVIEW_LOCATION_MAX_AGE_MS) throw new ReviewGateError('위치 확인 후 시간이 지났어요. 다시 확인해 주세요.')
      setEligibility({ status: 'ready', message: '' })
      if (fromCard) { updateEntry(null); setTarget(next) }
    } catch (error) {
      failed = true
      if (token !== request.current) return
      request.current++ // A failed check must not surface the other late completion.
      const message = reviewErrorMessage(error, locale)
      if (fromCard) {
        updateEntry({ id: next.id, status: error instanceof ReviewGateError && error.code === 'distance' ? 'notice' : 'retry', message })
      } else setEligibility({ status: 'blocked', message })
    }
  }
  const open = (next: Target) => {
    if (!REVIEW_DESIGN_PREVIEW) return
    if (!owner) { access.requireLogin(); return }
    if (!isMobileReviewDevice()) {
      updateEntry({ id: next.id, status: 'notice', message: t('review.mobileRequired') })
      return
    }
    if (entryRef.current?.id === next.id && entryRef.current.status === 'checking') return
    const fresh = entryRef.current?.id === next.id && entryRef.current.status === 'retry'
    setTarget(null); setEditing(null); setExistingPrompt(null)
    setMine(false); setSaved(false); setMessage('')
    const recent = recentToiletReview(reviews, next.id)
    if (recent) {
      if (recent.authorRemoved) updateEntry({ id: next.id, status: 'notice', message: '작성 후 24시간이 지나야 다시 리뷰를 남길 수 있어요.' })
      else { updateEntry(null); setExistingPrompt(recent) }
      return
    }
    // Keep the map/card still. Only a successful check opens the complete editor.
    void checkEligibility({ id: next.id, name: next.name, latitude: next.latitude, longitude: next.longitude }, fresh, true)
  }
  const openMine = async () => {
    await loadMine()
  }
  const loadMine = async (focusedReviewId?: string) => {
    if (!REVIEW_DESIGN_PREVIEW) return
    if (!owner) { access.requireLogin(); return }
    const token = ++request.current
    updateEntry(null)
    setMineFocus(value => ({ id: focusedReviewId, visit: value.visit + 1 }))
    setMessage(focusedReviewId ? t('review.existingHint') : '')
    setMine(true); setMineError(''); setTarget(null); setEditing(null); setSaved(false); setExistingPrompt(null)
    mineNavigation?.onOpen()
    setChecking(true)
    try {
      await session(token)
      if (token !== request.current) return
      setMine(true); setTarget(null); setSaved(false)
    } catch (error) { if (token === request.current) setMineError(reviewErrorMessage(error, locale)) }
    finally { if (token === request.current) setChecking(false) }
  }
  const close = () => { request.current++; updateEntry(null); setChecking(false); setTarget(null); setEditing(null); setMine(false); setSaved(false); setExistingPrompt(null); setMessage('') }
  const dismissExisting = () => { request.current++; setExistingPrompt(null) }
  const viewExisting = () => {
    const review = existingPrompt
    if (!review) return
    setExistingPrompt(null); void loadMine(review.id)
  }
  const save = async (value: ReviewInput) => {
    if (saving.current) throw new ReviewGateError('리뷰를 저장하고 있어요. 잠시 기다려 주세요.')
    saving.current = true
    try { await persistReview(value) } finally { saving.current = false }
  }
  const persistReview = async (value: ReviewInput) => {
    if (!REVIEW_DESIGN_PREVIEW || !target || ownerRef.current !== owner) throw new Error('Preview session changed')
    if (!editing && eligibility.status !== 'ready') throw new ReviewGateError('로그인과 위치 확인을 먼저 완료해 주세요.')
    if (editing && !canManageReview(editing)) throw new Error('Preview edit window expired')
    if (!editing) {
      const recent = recentToiletReview(reviews, target.id)
      if (recent) {
        if (!recent.authorRemoved) { setTarget(null); setEditing(null); setExistingPrompt(recent); return }
        throw new ReviewGateError('작성 후 24시간이 지나야 다시 리뷰를 남길 수 있어요.')
      }
    }
    const token = ++request.current
    // Recheck both in parallel; browser cache never extends a fix's original timestamp.
    // Editing a previously verified review only requires the same signed-in author within seven days.
    const [, measuredAt] = await Promise.all([session(token), !editing ? requireReviewLocation(target) : Promise.resolve(null)])
    if (token !== request.current || ownerRef.current !== owner) throw new ReviewGateError('로그인이 변경됐어요. 다시 확인해 주세요.')
    if (measuredAt !== null && Date.now() - measuredAt > REVIEW_LOCATION_MAX_AGE_MS) throw new ReviewGateError('위치 확인 후 시간이 지났어요. 다시 저장해 주세요.')
    if (editing && !canManageReview(editing)) throw new ReviewGateError('작성 후 7일이 지나 수정할 수 없어요.')
    const now = new Date().toISOString()
    setReviews(items => editing
      ? items.map(item => item.id === editing.id ? { ...item, ...value, updatedAt: now } : item)
      : [{ ...value, latitude: target.latitude, longitude: target.longitude, id: crypto.randomUUID(), toiletId: target.id, toiletName: target.name, createdAt: now, updatedAt: now, authorRemoved: false }, ...items].slice(0, 100))
    setTarget(null); setEditing(null); setSaved(true)
  }
  const summary = (toiletId: number): PreviewReviewSummary | undefined => {
    const items = reviews.filter(item => item.toiletId === toiletId)
    if (!items.length) return undefined
    // Preview card only: derive waiting/no-wait from the latest entry, without inventing a crowd threshold.
    const latest = items.reduce((a, b) => a.updatedAt >= b.updatedAt ? a : b)
    return { count: items.length, rating: String(Number((items.reduce((n, item) => n + item.satisfaction, 0) / items.length).toFixed(1))), paper: Math.round(items.filter(item => item.paper).length / items.length * 100), congestion: latest.waitMinutes > 0 ? '대기' : '원활' }
  }
  const closeOverlay = () => {
    if (!mine) { close(); return }
    request.current++; setTarget(null); setEditing(null); setSaved(false)
  }
  const mineContent = <MyReviewsPanel key={`${owner}:${mineFocus.visit}`} focusedReviewId={mineFocus.id} reviews={reviews} loading={checking} error={mineError} message={message} onRetry={() => { void loadMine(mineFocus.id) }}
    onBack={mineNavigation?.embedded ? () => { close(); mineNavigation.onClose() } : undefined}
    onEdit={item => { setEditing(item); setTarget({ id: item.toiletId, name: item.toiletName, latitude: item.latitude, longitude: item.longitude }) }}
    onDetach={item => {
      if (!canManageReview(item) || ownerRef.current !== owner) return
      // Explicit unlink of this one review only; never change the profile or other authors.
      setReviews(items => items.map(review => review.id === item.id ? { ...review, authorRemoved: true } : review))
      setMessage(t('review.detached'))
    }} />
  const modal = !REVIEW_DESIGN_PREVIEW ? null : target ? <ReviewDialog key={`${owner}:${editing?.id ?? target.id}`} toiletName={target.name} initial={editing ?? undefined} onClose={closeOverlay} onSave={save} eligibility={editing ? undefined : eligibility} onRetryEligibility={editing ? undefined : () => { void checkEligibility(target, true) }} />
    : saved ? <ReviewModal title={t('review.saved')} onClose={closeOverlay} footer={<div className="rv-two-actions"><button className="rv-secondary" onClick={closeOverlay}>{t(mine ? 'review.backList' : 'detail.back')}</button><button className="rv-primary" onClick={openMine}>{t('review.viewMine')}</button></div>}><div className="rv-complete"><span><ReviewIcon name="check" size={32} /></span><h1>{t('review.savedTitle')}</h1><p>{t('review.previewSaved')}</p><small>{t('review.previewMemory')}</small></div></ReviewModal>
    : existingPrompt ? <ReviewModal title={t('review.existingTitle')} onClose={dismissExisting} footer={<div className="rv-two-actions"><button className="rv-secondary" onClick={dismissExisting}>{t('common.back')}</button><button className="rv-primary" onClick={viewExisting}>{t('review.viewMine')}</button></div>}><div className="rv-complete"><h1>{existingPrompt.toiletName}</h1><p>{t('review.existingQuestion')}</p></div></ReviewModal>
    : mine && !mineNavigation?.embedded ? <ReviewModal title={t('nav.myReviews')} onClose={close}>{mineContent}</ReviewModal> : null
  return { open, openMine, close, summary, entryState: (id: number) => entry?.id === id ? entry : undefined, modal, page: REVIEW_DESIGN_PREVIEW && mine && mineNavigation?.embedded ? mineContent : null, active: Boolean(target || mine || saved || existingPrompt || checking || entry?.status === 'checking') }
}
