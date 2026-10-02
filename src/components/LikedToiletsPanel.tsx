'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiBaseUrl } from '../config/api'
import { fetchSessionRead } from '../api/session'
import { useLocale, useMessages } from '../i18n/context'
import { localizedPublicPath } from '../i18n/routes'
import { toiletPath } from '../lib/toiletRoute'
import { localizeToilet } from '../i18n/toiletTranslations'
import { createEngagementApi, EngagementError, type LikedToilet, type LikeSort } from '../lib/toiletEngagement'
import { HistoryHeading, HistoryMore } from './HistoryControls'
import { ToiletListItem } from './ToiletListItem'
import { likedListView, likedListScrollContainer } from '../lib/likedListView'
import { requestBrowserLocation } from '../lib/browserLocation'
import './liked-toilets.css'

const api = createEngagementApi(apiBaseUrl, fetchSessionRead)
type Position = { latitude: number; longitude: number }

function distanceInMetres(from: Position, to: LikedToilet) {
  if (to.latitude === null || to.longitude === null) return null
  const radians = Math.PI / 180
  const dLat = (to.latitude - from.latitude) * radians, dLon = (to.longitude - from.longitude) * radians
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(from.latitude * radians) * Math.cos(to.latitude * radians) * Math.sin(dLon / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function LikedToiletsPanel({ owner, onClose, onSessionExpired, onOpenToilet }: { owner: string; onClose: () => void; onSessionExpired: () => void; onOpenToilet?: (item: LikedToilet) => void }) {
  const t = useMessages(), locale = useLocale(), router = useRouter()
  const [saved] = useState(() => likedListView.read(owner))
  const [sort, setSort] = useState<LikeSort>(saved.sort)
  const [position, setPosition] = useState<Position | null>(saved.position)
  const [locationError, setLocationError] = useState(false)
  const [items, setItems] = useState<LikedToilet[]>([])
  const [total, setTotal] = useState(0), [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(''), [busyId, setBusyId] = useState<number | null>(null)
  const [refresh, setRefresh] = useState(0)
  const generation = useRef(0)
  const section = useRef<HTMLElement>(null)
  const viewRevision = useRef(saved.revision)
  const restoreScroll = useRef<number | null>(saved.scrollTop)
  const scrollPosition = useRef(saved.scrollTop)
  const locationRequest = useRef<AbortController | null>(null)
  const initialLocationRequest = useRef<AbortController | null>(null)
  const distanceLatitude = sort === 'distance' ? position?.latitude : null
  const distanceLongitude = sort === 'distance' ? position?.longitude : null

  useEffect(() => {
    if (position) return // Keep the distance-sort origin stable while visiting details and returning.
    if (!navigator.geolocation) {
      // No browser location service: the list remains available with distance labels deferred.
      queueMicrotask(() => { setLocationError(true); if (sort === 'distance') setLoading(false) })
      return
    }
    const controller = new AbortController()
    initialLocationRequest.current = controller
    void requestBrowserLocation(navigator.geolocation, controller.signal, false).then(point => {
      setPosition({ latitude: point.coords.latitude, longitude: point.coords.longitude }); setLocationError(false)
    }).catch(() => { if (!controller.signal.aborted) { setLocationError(true); if (sort === 'distance') setLoading(false) } })
    return () => controller.abort()
  }, [position, refresh]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => locationRequest.current?.abort(), [])

  useEffect(() => likedListView.subscribe(changedOwner => {
    generation.current++
    initialLocationRequest.current?.abort(); locationRequest.current?.abort()
    if (changedOwner !== owner) { setItems([]); setTotal(0); setLoading(false); return }
    const next = likedListView.read(owner)
    viewRevision.current = next.revision
    restoreScroll.current = next.scrollTop
    scrollPosition.current = next.scrollTop
    setSort(next.sort); setPosition(next.position); setItems([]); setTotal(0); setPage(0)
    setError(''); setLoading(true); setLoadingMore(false); setRefresh(value => value + 1)
  }), [owner])

  const view = useRef({ sort, position, page })
  useLayoutEffect(() => {
    view.current = { sort, position, page }
    likedListView.save(owner, { ...view.current, scrollTop: scrollPosition.current, revision: viewRevision.current })
  }, [owner, sort, position, page])
  useLayoutEffect(() => {
    if (!section.current) return
    const container = likedListScrollContainer(section.current)
    const target = container === document.scrollingElement ? window : container
    const save = () => {
      if (restoreScroll.current !== null) return
      scrollPosition.current = container.scrollTop
      likedListView.save(owner, { ...view.current, scrollTop: scrollPosition.current, revision: viewRevision.current })
    }
    target.addEventListener('scroll', save, { passive: true })
    return () => { save(); target.removeEventListener('scroll', save) }
  }, [owner])
  useLayoutEffect(() => {
    if (loading || !section.current || restoreScroll.current === null) return
    const container = likedListScrollContainer(section.current)
    // Parent mobile-page layout resets first; restore after its layout effect, once rows exist.
    const frame = requestAnimationFrame(() => {
      container.scrollTop = restoreScroll.current ?? 0
      scrollPosition.current = container.scrollTop
      restoreScroll.current = null
    })
    return () => cancelAnimationFrame(frame)
  }, [loading, items])

  useEffect(() => {
    if (sort === 'distance' && !position) return
    const requestGeneration = generation
    const token = ++requestGeneration.current
    let active = true
    void (async () => {
      const first = await api.listLikes(sort, 0, position ?? undefined)
      const restored = { ...first, items: [...first.items] }
      // Revalidate private rows, including already-opened pages; do not persist API responses in storage.
      const lastPage = refresh === 0 && sort === saved.sort ? saved.page : 0
      for (let next = 1; next <= lastPage && restored.items.length < restored.total; next++) {
        if (!active || token !== requestGeneration.current) return null
        const result = await api.listLikes(sort, next, position ?? undefined)
        restored.items.push(...result.items.filter(item => !restored.items.some(existing => existing.id === item.id)))
        restored.total = result.total; restored.page = next
        if (!result.items.length) break
      }
      return restored
    })().then(result => {
      if (!result) return
      if (!active || token !== requestGeneration.current) return
      setItems(result.items); setTotal(result.total); setPage(result.page)
    }).catch(reason => {
      if (!active || token !== requestGeneration.current) return
      setError(t('liked.loadError'))
      if (reason instanceof EngagementError && reason.status === 401) { likedListView.clear(); onSessionExpired() }
    }).finally(() => { if (active && token === requestGeneration.current) setLoading(false) })
    return () => { active = false; requestGeneration.current++ }
  }, [owner, sort, distanceLatitude, distanceLongitude, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  const applySort = (next: LikeSort) => {
    if (next === sort) return
    restoreScroll.current = 0; scrollPosition.current = 0
    setError(''); setLoadingMore(false)
    setItems([]); setTotal(0); setPage(0); setLoading(true); setSort(next)
  }
  const chooseSort = (next: LikeSort, retryLocation = false) => {
    locationRequest.current?.abort()
    if (!retryLocation && next === sort) return
    if (next !== 'distance' && !retryLocation) { applySort(next); return }
    initialLocationRequest.current?.abort()
    if (!navigator.geolocation) { setLocationError(true); return }
    const controller = new AbortController()
    locationRequest.current = controller
    void requestBrowserLocation(navigator.geolocation, controller.signal, false).then(point => {
      setPosition({ latitude: point.coords.latitude, longitude: point.coords.longitude }); setLocationError(false)
      if (next === sort) { setLoading(true); setRefresh(value => value + 1) }
      else applySort(next)
    }).catch(() => { if (!controller.signal.aborted) setLocationError(true) })
  }
  const loadMore = () => {
    if (loadingMore || loading || items.length >= total) return
    const token = generation.current, next = page + 1
    setLoadingMore(true); setError('')
    void api.listLikes(sort, next, position ?? undefined).then(result => {
      if (token !== generation.current) return
      setItems(current => [...current, ...result.items.filter(item => !current.some(existing => existing.id === item.id))])
      setTotal(result.total); setPage(next)
    }).catch(reason => {
      if (token !== generation.current) return
      setError(t('liked.loadError'))
      if (reason instanceof EngagementError && reason.status === 401) { likedListView.clear(); onSessionExpired() }
    }).finally(() => { if (token === generation.current) setLoadingMore(false) })
  }
  const unlike = (id: number) => {
    if (busyId !== null) return
    setBusyId(id); setError('')
    void api.setLike(id, false).then(() => {
      // Removal invalidates rows but keeps the user's selected sort. Only an addition resets it.
      likedListView.changed(owner, false)
    }).catch(reason => {
      setError(t('liked.unlikeError'))
      if (reason instanceof EngagementError && reason.status === 401) { likedListView.clear(); onSessionExpired() }
    }).finally(() => setBusyId(null))
  }
  const distanceLabel = (item: LikedToilet) => {
    if (!position) return t('liked.locationNeeded')
    const metres = distanceInMetres(position, item)
    if (metres === null) return t('liked.distanceUnavailable')
    const formatted = metres < 1000 ? `${Math.round(metres).toLocaleString(locale)} m` : `${(metres / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} km`
    return `${t('map.fromMe')} ${formatted}`
  }
  const retry = () => { setLoading(true); setError(''); setRefresh(value => value + 1) }
  return <section ref={section} className="history-list liked-toilets" aria-label={t('nav.myLikes')}>
    <HistoryHeading title={t('nav.myLikes')} onClose={onClose} />
    <div className="liked-toolbar"><label htmlFor="liked-sort">{t('liked.sort')}</label><span className="liked-sort-field"><select id="liked-sort" value={sort} onChange={event => chooseSort(event.target.value as LikeSort)}>
      <option value="newest">{t('liked.newest')}</option><option value="oldest">{t('liked.oldest')}</option><option value="distance">{t('liked.nearest')}</option>
    </select><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span><span className="liked-total">{t('liked.count', { count: total })}</span></div>
    {locationError && <p className="liked-notice" role="status">{t('liked.locationUnavailable')} <button type="button" onClick={() => chooseSort(sort, true)}>{t('common.retry')}</button></p>}
    {error && <div className="my-reports-retry"><p role="alert">{error}</p><button type="button" className="my-reports-retry-button" onClick={retry}>{t('common.retry')}</button></div>}
    {loading && !items.length ? <p className="mobile-page-loading" role="status">{t('common.loading')}</p> : <>
      {!items.length && !error && !(sort === 'distance' && locationError) && <div className="history-empty"><strong>{t('liked.empty')}</strong><p>{t('liked.emptyHint')}</p></div>}
      <div className="liked-list">{items.map(item => {
        const translations = Object.fromEntries(Object.entries(item.translations).map(([language, name]) => [language, { name, roadAddress: null, jibunAddress: null }]))
        const name = localizeToilet({ name: item.name, translations }, locale).name
        return <article key={item.id} className="liked-row"><ToiletListItem id={item.id} name={name} type={item.toiletType} count={1} distance={distanceLabel(item)} distanceBelow active={false}
          onSelect={() => onOpenToilet ? onOpenToilet(item) : router.push(localizedPublicPath(toiletPath(item.id), locale)!, { scroll: false })} />
          <button type="button" className="liked-row-unlike" aria-label={t('liked.unlikeNamed', { name })} title={t('liked.unlike')} disabled={busyId !== null} onClick={() => unlike(item.id)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>
          </button></article>
      })}</div>
      {!error && !loading && <HistoryMore count={items.length} total={total} onMore={loadMore} label={t('liked.more')} />}
      {loadingMore && <p role="status">{t('common.loading')}</p>}
    </>}
  </section>
}
