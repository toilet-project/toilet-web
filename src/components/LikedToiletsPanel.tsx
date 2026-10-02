'use client'

import { useEffect, useRef, useState } from 'react'
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
  const [sort, setSort] = useState<LikeSort>('newest')
  const [position, setPosition] = useState<Position | null>(null)
  const [locationError, setLocationError] = useState(false)
  const [items, setItems] = useState<LikedToilet[]>([])
  const [total, setTotal] = useState(0), [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true), [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(''), [busyId, setBusyId] = useState<number | null>(null)
  const [refresh, setRefresh] = useState(0)
  const generation = useRef(0)
  const sortRequest = useRef(0)
  const distanceLatitude = sort === 'distance' ? position?.latitude : null
  const distanceLongitude = sort === 'distance' ? position?.longitude : null

  useEffect(() => {
    if (!navigator.geolocation) {
      // No browser location service: the list remains available with distance labels deferred.
      queueMicrotask(() => setLocationError(true))
      return
    }
    navigator.geolocation.getCurrentPosition(
      point => setPosition({ latitude: point.coords.latitude, longitude: point.coords.longitude }),
      () => setLocationError(true),
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 10000 },
    )
  }, [])

  useEffect(() => {
    if (sort === 'distance' && !position) return
    const requestGeneration = generation
    const token = ++requestGeneration.current
    let active = true
    void api.listLikes(sort, 0, position ?? undefined).then(result => {
      if (!active || token !== requestGeneration.current) return
      setItems(result.items); setTotal(result.total); setPage(0)
    }).catch(reason => {
      if (!active || token !== requestGeneration.current) return
      setError(t('liked.loadError'))
      if (reason instanceof EngagementError && reason.status === 401) onSessionExpired()
    }).finally(() => { if (active && token === requestGeneration.current) setLoading(false) })
    return () => { active = false; requestGeneration.current++ }
  }, [owner, sort, distanceLatitude, distanceLongitude, refresh]) // eslint-disable-line react-hooks/exhaustive-deps

  const applySort = (next: LikeSort) => {
    if (next === sort) return
    setItems([]); setTotal(0); setPage(0); setLoading(true); setSort(next)
  }
  const chooseSort = (next: LikeSort) => {
    const request = ++sortRequest.current
    if (next !== 'distance' || position) { applySort(next); return }
    if (!navigator.geolocation) { setLocationError(true); return }
    navigator.geolocation.getCurrentPosition(point => {
      if (request !== sortRequest.current) return
      setPosition({ latitude: point.coords.latitude, longitude: point.coords.longitude }); setLocationError(false); applySort('distance')
    }, () => { if (request === sortRequest.current) setLocationError(true) }, { enableHighAccuracy: false, maximumAge: 0, timeout: 10000 })
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
      if (reason instanceof EngagementError && reason.status === 401) onSessionExpired()
    }).finally(() => { if (token === generation.current) setLoadingMore(false) })
  }
  const unlike = (id: number) => {
    if (busyId !== null) return
    setBusyId(id); setError('')
    void api.setLike(id, false).then(() => {
      setItems(current => current.filter(item => item.id !== id)); setTotal(current => Math.max(0, current - 1))
      // Restart pagination after deletion so an offset cannot skip the next liked restroom.
      setLoading(true); setRefresh(value => value + 1)
    }).catch(reason => {
      setError(t('liked.unlikeError'))
      if (reason instanceof EngagementError && reason.status === 401) onSessionExpired()
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
  return <section className="history-list liked-toilets" aria-label={t('nav.myLikes')}>
    <HistoryHeading title={t('nav.myLikes')} onClose={onClose} />
    <div className="liked-toolbar"><label htmlFor="liked-sort">{t('liked.sort')}</label><span className="liked-sort-field"><select id="liked-sort" value={sort} onChange={event => chooseSort(event.target.value as LikeSort)}>
      <option value="newest">{t('liked.newest')}</option><option value="oldest">{t('liked.oldest')}</option><option value="distance">{t('liked.nearest')}</option>
    </select><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span><span className="liked-total">{t('liked.count', { count: total })}</span></div>
    {locationError && <p className="liked-notice" role="status">{t('liked.locationUnavailable')}</p>}
    {error && <div className="my-reports-retry"><p role="alert">{error}</p><button type="button" className="my-reports-retry-button" onClick={retry}>{t('common.retry')}</button></div>}
    {loading && !items.length ? <p className="mobile-page-loading" role="status">{t('common.loading')}</p> : <>
      {!items.length && !error && <div className="history-empty"><strong>{t('liked.empty')}</strong><p>{t('liked.emptyHint')}</p></div>}
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
