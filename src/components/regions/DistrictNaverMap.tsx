'use client'

import { useEffect, useRef, useState } from 'react'
import type { ToiletMapItemResponse } from '../../api/toilets'
import type { Locale } from '../../i18n/locale'
import { localizeToiletMapItem } from '../../i18n/toiletTranslations'
import { groupToiletsByCoordinate } from '../../lib/toiletGrouping'
import type { MapOverlay } from '../../lib/mapProvider'
import { loadedNaverMapLanguage, naverMapLanguageForLocale, naverMapLanguageNeedsReload } from '../../lib/mapProviderSelection'
import { regionBounds, regionName, polygonParts, type Region } from '../../lib/regions'
import { clusterRegionPoints } from '../../lib/regionMapClusters'
import { regionText } from './regionText'
import { DistrictToiletSelection } from './DistrictToiletSelection'

type NaverPolygon = { setMap(map: unknown | null): void }
type NaverMaps = {
  LatLng: new (lat: number, lng: number) => unknown
  LatLngBounds: new (sw: unknown, ne: unknown) => unknown
  Polygon: new (options: { map: unknown; paths: unknown[][]; strokeColor: string; strokeWeight: number; strokeOpacity: number; fillColor: string; fillOpacity: number; clickable: boolean }) => NaverPolygon
}

const recoveryKey = (locale: Locale, district: Region) => `district-map-recovery:${locale}:${district.code}`

function reloadOnceAfterMapFailure(locale: Locale, district: Region) {
  try {
    const key = recoveryKey(locale, district)
    if (window.sessionStorage.getItem(key)) return false
    window.sessionStorage.setItem(key, '1')
    window.location.reload()
    return true
  } catch { return false }
}

export function DistrictNaverMap({ district, toilets, locale, failed = false }: { district: Region; toilets: ToiletMapItemResponse[]; locale: Locale; failed?: boolean }) {
  const t = regionText(locale)
  const container = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<ToiletMapItemResponse[]>([])
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!container.current) return
    // A client-side link can reach this page after a map SDK was loaded in a
    // different language. NAVER cannot change that SDK in place.
    if (naverMapLanguageNeedsReload(loadedNaverMapLanguage(), naverMapLanguageForLocale(locale))) {
      window.location.reload()
      return
    }
    const abort = new AbortController()
    let cleanup: (() => void) | undefined
    setSelected([])
    setError(false)
    const bounds = regionBounds(district)
    const center = { latitude: (bounds.south + bounds.north) / 2, longitude: (bounds.west + bounds.east) / 2 }
    const element = container.current
    void import('../../lib/mapProvider').then(async ({ createMap, createMapCoordinate, createMapOverlay, destroyMap, addMapEventListener }) => {
      const map = await createMap(element, center, 7, locale, abort.signal, 'naver')
      if (abort.signal.aborted) { destroyMap(map); return }
      const maps = window.naver?.maps as unknown as NaverMaps | undefined
      if (!maps) throw new Error('Naver Maps unavailable')
      const polygon = new maps.Polygon({
        map: map.raw,
        paths: polygonParts(district.geometry).flatMap(rings => rings.map(ring => ring.map(([lng, lat]) => new maps.LatLng(lat, lng)))),
        strokeColor: '#08734b', strokeWeight: 2, strokeOpacity: .95, fillColor: '#56a47b', fillOpacity: 0, clickable: false,
      })
      const overlays: MapOverlay[] = []
      const localized = toilets.map(toilet => localizeToiletMapItem(toilet, locale))
      const points = groupToiletsByCoordinate(localized, locale)
      function drawMarkers() {
        overlays.splice(0).forEach(overlay => overlay.setMap(null))
        const projection = map.getProjection()
        const clusters = clusterRegionPoints(points, point => projection.pointFromCoords(createMapCoordinate(map, point.latitude, point.longitude)), element.clientWidth, element.clientHeight, map.getLevel() > 2 ? 76 : 0)
        for (const cluster of clusters) {
          if (cluster.items.length > 1) {
            const content = document.createElement('button')
            content.type = 'button'
            content.className = 'region-map-cluster'
            content.textContent = cluster.count.toLocaleString(locale)
            content.setAttribute('aria-label', `${cluster.count.toLocaleString(locale)} ${t.toilets} · ${t.zoomIn}`)
            content.addEventListener('click', event => {
              event.stopPropagation()
              setSelected([])
              const coordinate = createMapCoordinate(map, cluster.latitude, cluster.longitude)
              map.setCenter(coordinate)
              map.setLevel(Math.max(1, map.getLevel() - 2))
            })
            const overlay = createMapOverlay(map, { position: createMapCoordinate(map, cluster.latitude, cluster.longitude), content, yAnchor: .5, zIndex: 3 })
            overlay.setMap(map)
            overlays.push(overlay)
            continue
          }
          const point = cluster.items[0]
          const content = document.createElement('button')
          content.type = 'button'
          content.className = 'toilet-marker region-map-marker'
          const name = point.displayGroupName || point.name || point.toilets?.[0]?.name || t.toilets
          content.title = name
          content.setAttribute('aria-label', `${name} ${point.count > 1 ? `(${point.count})` : ''}`)
          const pin = document.createElement('span')
          pin.className = 'toilet-marker-pin'
          pin.setAttribute('aria-hidden', 'true')
          const logo = document.createElement('img')
          logo.className = 'toilet-marker-logo'
          logo.src = '/toilet-marker-logo.svg'
          logo.alt = ''
          logo.setAttribute('aria-hidden', 'true')
          logo.width = 24
          logo.height = 24
          pin.append(logo)
          const label = document.createElement('span')
          label.className = 'toilet-marker-name'
          label.textContent = name
          content.append(pin, label)
          if (point.count > 1) {
            const badge = document.createElement('span')
            badge.className = 'region-marker-count'
            badge.textContent = point.count.toLocaleString(locale)
            content.append(badge)
          }
          content.addEventListener('click', event => {
            event.stopPropagation()
            const ids = new Set((point.toilets ?? [point]).map(toilet => toilet.id))
            setSelected(toilets.filter(toilet => ids.has(toilet.id)))
          })
          const overlay = createMapOverlay(map, { position: createMapCoordinate(map, point.latitude, point.longitude), content, yAnchor: 1, zIndex: 2 })
          overlay.setMap(map)
          overlays.push(overlay)
        }
      }
      const removeIdle = addMapEventListener(map, 'idle', drawMarkers)
      const removeZoom = addMapEventListener(map, 'zoom_changed', () => { setSelected([]); drawMarkers() })
      const resize = new ResizeObserver(() => { map.relayout(); drawMarkers() })
      resize.observe(element)
      ;(map.raw as { fitBounds(bounds: unknown, options?: { top: number; right: number; bottom: number; left: number }): void }).fitBounds(
        new maps.LatLngBounds(new maps.LatLng(bounds.south, bounds.west), new maps.LatLng(bounds.north, bounds.east)),
        { top: 30, right: 30, bottom: 30, left: 30 },
      )
      drawMarkers()
      try { window.sessionStorage.removeItem(recoveryKey(locale, district)) } catch { /* Optional recovery guard. */ }
      cleanup = () => { removeIdle(); removeZoom(); resize.disconnect(); overlays.forEach(overlay => overlay.setMap(null)); polygon.setMap(null); destroyMap(map) }
    }).catch(error => {
      if (abort.signal.aborted) return
      // Also cover a language switch racing with the SDK script's insertion.
      if (naverMapLanguageNeedsReload(loadedNaverMapLanguage(), naverMapLanguageForLocale(locale))) window.location.reload()
      else {
        console.warn('District map initialization failed', error)
        if (!reloadOnceAfterMapFailure(locale, district)) setError(true)
      }
    })
    return () => { abort.abort(); cleanup?.() }
  }, [district, toilets, locale, t])

  return <div className="district-map-wrap">
    <div className="district-naver-map" ref={container} role="region" aria-label={`${regionName(district, locale)} · ${t.locationMap}`} />
    {(error || failed) && <p className="district-map-error" role="alert">{error ? t.mapError : t.error}</p>}
    {!error && !failed && toilets.length === 0 && <p className="district-map-error" role="status">{t.empty}</p>}
    {selected.length > 0 && <DistrictToiletSelection key={selected.map(toilet => toilet.id).join(':')} toilets={selected} locale={locale} onClose={() => setSelected([])} />}
  </div>
}
