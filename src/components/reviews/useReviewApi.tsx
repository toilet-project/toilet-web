'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { reviewApi } from '../../api/reviews'
import { ReviewApiError, type StoredReview } from '../../lib/reviewApi'
import { historyRange } from '../../lib/history'
import { canManageReview, type ReviewInput } from '../../lib/review'
import { requireReviewFix, reviewLocationProblem, ReviewGateError } from '../../lib/reviewLocation'
import { isMobileReviewDevice, MOBILE_REVIEW_ONLY_MESSAGE } from '../../lib/reviewDevice'
import { ReviewDialog, ReviewModal, type ReviewEligibility } from './ReviewDialog'
import { MyReviewsPanel } from './MyReviewsPanel'
import type { MineNavigation, PreviewReviewSummary, ReviewAccess, ReviewEntryState, ReviewTarget } from './useIntegratedReviewPreview'

type Entry = ReviewEntryState & { id: number }
type ExistingPrompt = { reviewId: string; toiletId: number; toiletName: string }
const apiMessage = (error: unknown) => error instanceof ReviewApiError || error instanceof ReviewGateError ? error.message : '리뷰를 불러오지 못했어요. 다시 확인해 주세요.'
const sameInput = (toiletId: number, v: ReviewInput) => JSON.stringify([toiletId, v.satisfaction, v.cleanliness, v.paper, v.waitMinutes, v.comment])

/** Server-backed mode. No memory fallback after an API error, and no writes to fixture facilities. */
export function useReviewApi(owner: string | null, access: ReviewAccess, navigation?: MineNavigation) {
  const [target, setTarget] = useState<ReviewTarget | null>(null), [editing, setEditing] = useState<StoredReview | null>(null)
  const [mine, setMine] = useState(false), [saved, setSaved] = useState(false)
  const [existingPrompt, setExistingPrompt] = useState<ExistingPrompt | null>(null)
  const [entry, setEntry] = useState<Entry | null>(null), entryRef = useRef<Entry | null>(null)
  const [eligibility, setEligibility] = useState<ReviewEligibility>({ status: 'ready', message: '' })
  const [items, setItems] = useState<StoredReview[]>([]), [range, setRange] = useState(() => historyRange())
  const [listLoading, setListLoading] = useState(false), [listError, setListError] = useState('')
  const [moreLoading, setMoreLoading] = useState(false), [moreError, setMoreError] = useState('')
  const [cursor, setCursor] = useState<string | null>(null), [hasMore, setHasMore] = useState(false)
  const [message, setMessage] = useState(''), [focus, setFocus] = useState<{ id?: string; visit: number }>({ visit: 0 })
  const [summaries, setSummaries] = useState<Record<number, PreviewReviewSummary>>({})
  const epoch = useRef(0), ownerRef = useRef(owner), mounted = useRef(true), writing = useRef(false), loadingMore = useRef<number | null>(null)
  const summaryEpoch = useRef(0)
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null)
  const current = (token: number) => mounted.current && token === epoch.current && ownerRef.current === owner
  const updateEntry = (value: Entry | null) => { entryRef.current = value; setEntry(value) }
  useEffect(() => {
    const life = mounted, generation = epoch
    life.current = true
    return () => { life.current = false; generation.current++ }
  }, [])
  useLayoutEffect(() => {
    if (ownerRef.current === owner) return
    ownerRef.current = owner; epoch.current++; attempt.current = null
    updateEntry(null); setItems([]); setMine(false); setTarget(null); setEditing(null); setSaved(false); setExistingPrompt(null)
    setListLoading(false); setListError(''); setMoreError(''); setMoreLoading(false); setHasMore(false); setCursor(null); setMessage(''); setSummaries({})
  }, [owner])
  useLayoutEffect(() => {
    if (entryRef.current) { epoch.current++; updateEntry(null) }
  }, [navigation?.contextKey])
  // Summary is public but names/author state are not cached. Only the selected facility is loaded.
  useEffect(() => {
    const id = navigation?.toiletId
    if (!id || id <= 0) return
    let active = true
    const clear = () => setSummaries(values => { const next = { ...values }; delete next[id]; return next })
    const load = () => { const token = ++summaryEpoch.current; clear(); void reviewApi.summary(id).then(value => { if (active && token === summaryEpoch.current) setSummaries({ [id]: summaryValue(value) }) }).catch(() => { if (active && token === summaryEpoch.current) clear() }) }
    load(); window.addEventListener('focus', load)
    return () => { active = false; window.removeEventListener('focus', load) }
  }, [navigation?.toiletId, owner])

  async function session(token: number) {
    if (!owner || !current(token)) throw new ReviewGateError('로그인 후 리뷰를 이용해 주세요.', 'session')
    let active = true, timer: ReturnType<typeof setTimeout> | undefined
    try {
      const valid = await Promise.race([access.verifySession(() => active && current(token)), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new ReviewGateError('로그인 확인이 지연되고 있어요. 다시 시도해 주세요.', 'session')), 12_000) })])
      if (!valid || !current(token)) throw new ReviewGateError('로그인을 다시 확인해 주세요.', 'session')
    } finally { active = false; clearTimeout(timer) }
  }
  function authFailure(error: unknown) {
    if (error instanceof ReviewApiError && error.code === 'AUTHENTICATION_REQUIRED') {
      setItems([]); setTarget(null); setEditing(null); attempt.current = null; access.requireLogin()
    }
  }
  function close() {
    epoch.current++; updateEntry(null); setTarget(null); setEditing(null); setSaved(false); setMine(false); setExistingPrompt(null)
    setItems([]); setListLoading(false); setMoreLoading(false); setMessage(''); attempt.current = null
  }
  async function loadMine(nextRange = historyRange(), focusedId?: string, expectedToilet?: number) {
    if (!owner) { access.requireLogin(); return }
    const token = ++epoch.current
    updateEntry(null); setMine(true); setTarget(null); setEditing(null); setSaved(false); setExistingPrompt(null); setRange(nextRange)
    setFocus(value => ({ id: focusedId, visit: value.visit + 1 })); setItems([]); setCursor(null); setHasMore(false)
    setMessage(focusedId ? '작성한 리뷰 내역이 있습니다. 기존 리뷰를 확인하거나 수정해 주세요.' : '')
    setListLoading(true); setListError(''); setMoreError(''); setMoreLoading(false); navigation?.onOpen()
    try {
      await session(token)
      if (!current(token)) return
      const [page, focused] = await Promise.all([reviewApi.mine(nextRange), focusedId ? reviewApi.detail(focusedId) : Promise.resolve(null)])
      if (!current(token)) return
      if (focused && expectedToilet !== undefined && focused.toiletId !== expectedToilet) throw new ReviewApiError('INVALID_RESPONSE', '기존 리뷰의 화장실을 확인하지 못했어요.')
      setItems(focused && !page.items.some(item => item.id === focused.id) ? [...page.items, focused] : page.items)
      setCursor(page.nextCursor); setHasMore(page.hasMore)
    } catch (error) { if (current(token)) { authFailure(error); setListError(apiMessage(error)) } }
    finally { if (current(token)) setListLoading(false) }
  }
  const openMine = () => loadMine()
  function promptExisting(next: ReviewTarget, reviewId: string) {
    updateEntry(null); setMine(false); setTarget(null); setEditing(null); setSaved(false)
    setExistingPrompt({ reviewId, toiletId: next.id, toiletName: next.name })
  }
  function dismissExisting() { epoch.current++; setExistingPrompt(null) }
  function viewExisting() {
    const prompt = existingPrompt
    if (!prompt) return
    setExistingPrompt(null); void loadMine(historyRange(), prompt.reviewId, prompt.toiletId)
  }
  async function more() {
    if (loadingMore.current === epoch.current || listLoading || !hasMore || !cursor) return
    const token = epoch.current, next = cursor
    loadingMore.current = token; setMoreLoading(true); setMoreError('')
    try {
      await session(token)
      if (!current(token)) return
      const page = await reviewApi.mine(range, next)
      if (!current(token)) return
      setItems(values => [...values, ...page.items.filter(item => !values.some(v => v.id === item.id))])
      setCursor(page.nextCursor); setHasMore(page.hasMore)
    } catch (error) { if (current(token)) { authFailure(error); setMoreError(apiMessage(error)) } }
    finally { if (loadingMore.current === token) loadingMore.current = null; if (current(token)) setMoreLoading(false) }
  }
  async function check(next: ReviewTarget, fresh = false, inEditor = false) {
    if (!owner) { access.requireLogin(); return }
    if (next.id <= 0) { updateEntry({ id: next.id, status: 'notice', message: '테스트 화장실에는 실제 리뷰를 저장하지 않아요.' }); return }
    const token = ++epoch.current
    if (inEditor) setEligibility({ status: 'checking', message: '현재 위치를 확인하고 있어요.' })
    else updateEntry({ id: next.id, status: 'checking', message: '작성한 리뷰·로그인 확인 중' })
    try {
      const [, status] = await Promise.all([session(token), reviewApi.status(next.id)])
      if (!current(token)) return
      if (!status.canCreate) {
        if (status.existingReviewId) { promptExisting(next, status.existingReviewId); return }
        throw new ReviewApiError('REVIEW_ALREADY_EXISTS', '작성 후 24시간이 지나야 다시 리뷰를 남길 수 있어요.')
      }
      if (!inEditor) updateEntry({ id: next.id, status: 'checking', message: '현재 위치 확인 중' })
      await requireReviewFix(next, { fresh })
      if (!current(token)) return
      setEligibility({ status: 'ready', message: '' })
      if (!inEditor) { updateEntry(null); setTarget(next); setEditing(null); attempt.current = null }
    } catch (error) {
      if (!current(token)) return
      epoch.current++; authFailure(error)
      if (inEditor) setEligibility({ status: 'blocked', message: apiMessage(error) })
      else updateEntry({ id: next.id, status: error instanceof ReviewGateError && error.code === 'distance' || error instanceof ReviewApiError && error.code === 'REVIEW_ALREADY_EXISTS' ? 'notice' : 'retry', message: apiMessage(error) })
    }
  }
  function open(next: ReviewTarget) {
    if (entryRef.current?.status === 'checking') return
    if (!owner) { access.requireLogin(); return }
    if (!isMobileReviewDevice()) {
      updateEntry({ id: next.id, status: 'notice', message: MOBILE_REVIEW_ONLY_MESSAGE })
      return
    }
    const fresh = entryRef.current?.id === next.id && entryRef.current.status === 'retry'
    setMine(false); setSaved(false); setTarget(null); setEditing(null); setExistingPrompt(null)
    void check(next, fresh)
  }
  async function edit(item: StoredReview) {
    const token = ++epoch.current
    setListLoading(true); setListError('')
    try {
      await session(token); if (!current(token)) return
      const latest = await reviewApi.detail(item.id)
      if (!current(token)) return
      if (!canManageReview(latest)) throw new ReviewApiError('REVIEW_EDIT_EXPIRED', '작성 후 7일이 지나 수정할 수 없어요.')
      setEditing(latest); setTarget({ id: latest.toiletId, name: latest.toiletName, latitude: null, longitude: null })
    } catch (error) { if (current(token)) { authFailure(error); setListError(apiMessage(error)) } }
    finally { if (current(token)) setListLoading(false) }
  }
  async function refreshSummary(id: number) {
    const account = ownerRef.current
    const token = ++summaryEpoch.current
    try { const value = await reviewApi.summary(id); if (mounted.current && token === summaryEpoch.current && account === ownerRef.current && navigation?.toiletId === id) setSummaries({ [id]: summaryValue(value) }) } catch { if (mounted.current && token === summaryEpoch.current) setSummaries({}) }
  }
  async function save(value: ReviewInput) {
    if (!target || writing.current) throw new ReviewGateError('리뷰 저장 상태를 확인해 주세요.')
    const token = epoch.current, facility = target, previous = editing
    writing.current = true
    try {
      await session(token); if (!current(token)) return
      let stored: StoredReview
      if (previous) stored = await reviewApi.edit(previous, value)
      else {
        const status = await reviewApi.status(facility.id)
        if (!current(token)) return
        if (!status.canCreate) {
          if (status.existingReviewId) { promptExisting(facility, status.existingReviewId); return }
          throw new ReviewApiError('REVIEW_ALREADY_EXISTS', '작성 후 24시간이 지나야 다시 리뷰를 남길 수 있어요.')
        }
        const fix = await requireReviewFix(facility)
        if (!current(token)) return
        const problem = reviewLocationProblem(facility, fix)
        if (problem) throw new ReviewGateError(problem)
        const fingerprint = sameInput(facility.id, value)
        if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() }
        stored = await reviewApi.create(facility.id, value, { latitude: fix.coords.latitude, longitude: fix.coords.longitude, accuracyMeters: fix.coords.accuracy, measuredAt: new Date(fix.timestamp).toISOString() }, attempt.current.key)
      }
      if (!current(token)) return
      attempt.current = null; setItems(values => values.map(item => item.id === stored.id ? stored : item))
      setTarget(null); setEditing(null); setSaved(true); void refreshSummary(facility.id)
    } catch (error) {
      if (!current(token)) return
      if (error instanceof ReviewApiError && error.code === 'REVIEW_ALREADY_EXISTS' && error.existingReviewId) { promptExisting(facility, error.existingReviewId); return }
      authFailure(error); throw error
    } finally { writing.current = false }
  }
  async function detach(item: StoredReview) {
    if (writing.current) throw new ReviewApiError('BUSY', '처리 중이에요. 잠시 기다려 주세요.')
    const token = epoch.current
    writing.current = true
    try {
      await session(token); if (!current(token)) return
      await reviewApi.detach(item)
      if (!current(token)) return
      setItems(values => values.filter(v => v.id !== item.id))
      setMessage('작성자 정보만 지웠어요. 글과 평가는 남고, 내 리뷰에서는 제외됐어요.'); void refreshSummary(item.toiletId)
    } catch (error) { if (current(token)) { authFailure(error); throw error } }
    finally { writing.current = false }
  }
  const closeOverlay = () => { if (writing.current) return; if (!mine) close(); else { epoch.current++; setTarget(null); setEditing(null); setSaved(false) } }
  const content = <MyReviewsPanel key={`${owner}:${focus.visit}`} reviews={items} focusedReviewId={focus.id} loading={listLoading} error={listError} message={message}
    onRetry={() => { void loadMine(range, focus.id) }} onBack={navigation?.embedded ? () => { if (!writing.current) { close(); navigation.onClose() } } : undefined}
    onEdit={item => { void edit(item) }} onDetach={detach} remote={{ range, onRangeChange: value => { void loadMine(value) }, hasMore, loadingMore: moreLoading, moreError, onMore: () => { void more() } }} />
  const modal = target ? <ReviewDialog key={`${owner}:${editing?.id ?? target.id}`} toiletName={target.name} initial={editing ?? undefined} onClose={closeOverlay} onSave={save}
    eligibility={editing ? undefined : eligibility} onRetryEligibility={editing ? undefined : () => { void check(target, true, true) }} />
    : saved ? <ReviewModal title="리뷰를 저장했어요" onClose={closeOverlay} footer={<div className="rv-two-actions"><button className="rv-secondary" onClick={closeOverlay}>{mine ? '목록으로 돌아가기' : '지도로 돌아가기'}</button><button className="rv-primary" onClick={() => { void openMine() }}>내 리뷰 보기</button></div>}><div className="rv-complete"><h1>이용 경험을 남겼어요</h1><p>저장한 리뷰는 내 리뷰에서 다시 확인할 수 있어요.</p></div></ReviewModal>
    : existingPrompt ? <ReviewModal title="작성한 리뷰가 있어요" onClose={dismissExisting} footer={<div className="rv-two-actions"><button className="rv-secondary" onClick={dismissExisting}>뒤로 가기</button><button className="rv-primary" onClick={viewExisting}>내 리뷰 보기</button></div>}><div className="rv-complete"><h1>{existingPrompt.toiletName}</h1><p>이 화장실에 오늘 작성한 리뷰가 있어요. 기존 리뷰를 확인할까요?</p></div></ReviewModal>
    : mine && !navigation?.embedded ? <ReviewModal title="내 리뷰" onClose={() => { if (!writing.current) close() }}>{content}</ReviewModal> : null
  return { open, openMine, close, summary: (id: number) => summaries[id], entryState: (id: number) => entry?.id === id ? entry : undefined,
    modal, page: mine && navigation?.embedded ? content : null, active: Boolean(target || saved || existingPrompt || mine || listLoading || entry?.status === 'checking') }
}
function summaryValue(value: Awaited<ReturnType<typeof reviewApi.summary>>): PreviewReviewSummary {
  return { count: value.count, rating: value.rating === null ? '—' : String(value.rating), paper: value.paperPercent,
    congestion: value.latestWaitMinutes === null ? '정보 없음' : value.latestWaitMinutes === 0 ? '원활' : '대기', source: 'api' }
}
