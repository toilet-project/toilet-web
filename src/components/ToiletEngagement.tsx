'use client'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiBaseUrl } from '../config/api'
import { fetchSessionRead } from '../api/session'
import { useLocale } from '../i18n/context'
import { engagementMessage } from '../i18n/engagementMessages'
import { createEngagementApi, createViewRecorder, EngagementError, observeDetailView } from '../lib/toiletEngagement'
import { likedListView } from '../lib/likedListView'
import './toilet-engagement.css'

const enabled = process.env.NEXT_PUBLIC_TOILET_ENGAGEMENT_ENABLED === 'true'
const api = createEngagementApi(apiBaseUrl, fetchSessionRead)
let recorder: ReturnType<typeof createViewRecorder> | undefined
const record = (id: number) => {
  if (!recorder) {
    let storage: Pick<Storage, 'getItem' | 'setItem'>
    try { storage = window.sessionStorage } catch { storage = { getItem: () => null, setItem: () => {} } }
    recorder = createViewRecorder(storage, () => crypto.randomUUID())
  }
  return recorder(id, (session, event) => api.view(id, session, event))
}
export type EngagementProps = { owner: string | null; active: boolean; requireLogin: () => void }
export function ToiletEngagement(props: EngagementProps & { toiletId: number }) {
  if (!enabled || props.toiletId <= 0) return null
  return <EngagementRow key={`${props.toiletId}:${props.owner ?? 'anonymous'}`} {...props} />
}
function EngagementRow({ toiletId, owner, active, requireLogin }: EngagementProps & { toiletId: number }) {
  const locale = useLocale(), t = (key: Parameters<typeof engagementMessage>[1]) => engagementMessage(locale, key)
  const [liked, setLiked] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true), [writing, setWriting] = useState(false), [error, setError] = useState('')
  const row = useRef<HTMLDivElement>(null), live = useRef(false), busy = useRef(false), generation = useRef(0)
  useEffect(() => { const lifecycle = live, request = generation; lifecycle.current = true; return () => { lifecycle.current = false; request.current++ } }, [])
  async function load() {
    const token = ++generation.current
    setLoading(true);setError('')
    try {
      const mine = owner ? await api.mine(toiletId) : null
      if (!live.current || token !== generation.current) return
      setLiked(mine?.liked ?? false)
    } catch (e) {
      if (!live.current || token !== generation.current) return
      setError(t('unavailable'));setLiked(null)
      if (e instanceof EngagementError && e.status === 401) requireLogin()
    } finally { if (live.current && token === generation.current) setLoading(false) }
  }
  const loadInitial = useEffectEvent(() => { void load() })
  useEffect(() => { const timer = setTimeout(() => loadInitial(), 0); return () => clearTimeout(timer) }, [])
  useEffect(() => {
    if (!active || !row.current) return
    return observeDetailView(row.current, () => {
      // Record the visible visit independently; totals never enter the card or cached detail.
      void record(toiletId).catch(() => { /* Reuse the pending event on the next visit. */ })
    })
  }, [active, toiletId])
  async function toggle() {
    if (!owner) { requireLogin(); return }
    if (busy.current || liked === null) return
    busy.current = true;setWriting(true);setError('')
    try {
      const result = await api.setLike(toiletId, !liked)
      likedListView.changed(owner, result.liked)
      if (!live.current) return
      setLiked(result.liked)
    } catch (e) {
      if (!live.current) return
      setError(t('failed'));setLiked(null)
      if (e instanceof EngagementError && e.status === 401) requireLogin()
    } finally { busy.current = false;if (live.current) setWriting(false) }
  }
  return <div ref={row} className="toilet-engagement" data-toilet-engagement={toiletId}>
    <button type="button" className={`toilet-like${liked ? ' is-liked' : ''}`} aria-label={t(liked ? 'unlike' : 'like')} title={t(liked ? 'unlike' : 'like')} aria-pressed={liked === null ? undefined : liked} disabled={writing || !!owner && (loading || liked === null)} aria-busy={writing || !!owner && loading || undefined} onClick={() => void toggle()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>
    </button>
    {error && createPortal(<div className="engagement-error" role="status">{error} <button type="button" onClick={() => void load()} disabled={loading}>{t('retry')}</button></div>, document.body)}
  </div>
}
