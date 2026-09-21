'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { ToiletMapItemResponse } from '../../api/toilets'
import type { Locale } from '../../i18n/locale'
import { localizeToiletMapItem } from '../../i18n/toiletTranslations'
import { groupToiletsByCoordinate } from '../../lib/toiletGrouping'
import type { MapOverlay } from '../../lib/mapProvider'
import { regionBounds, polygonParts, type Region } from '../../lib/regions'
import { localizedPublicPath } from '../../i18n/routes'
import { regionToiletPath } from '../../lib/regionToiletPath'

type NaverPolygon = { setMap(map: unknown | null): void }
type NaverMaps = {
  LatLng: new (lat: number, lng: number) => unknown
  LatLngBounds: new (sw: unknown, ne: unknown) => unknown
  Polygon: new (options: { map: unknown; paths: unknown[][]; strokeColor: string; strokeWeight: number; strokeOpacity: number; fillColor: string; fillOpacity: number; clickable: boolean }) => NaverPolygon
}

export function DistrictNaverMap({ district, toilets, locale }: { district: Region; toilets: ToiletMapItemResponse[]; locale: Locale }) {
  const container = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<ToiletMapItemResponse[]>([])
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!container.current) return
    const abort = new AbortController()
    let cleanup: (() => void) | undefined
    setSelected([])
    setError(false)
    const bounds = regionBounds(district)
    const center = { latitude: (bounds.south + bounds.north) / 2, longitude: (bounds.west + bounds.east) / 2 }
    const element = container.current
    void import('../../lib/mapProvider').then(async ({ createMap, createMapCoordinate, createMapOverlay, destroyMap }) => {
      const map = await createMap(element, center, 7, locale, abort.signal, 'naver')
      if (abort.signal.aborted) { destroyMap(map); return }
      const maps = window.naver?.maps as unknown as NaverMaps | undefined
      if (!maps) throw new Error('Naver Maps unavailable')
      const polygon = new maps.Polygon({
        map: map.raw,
        paths: polygonParts(district.geometry).flatMap(rings => rings.map(ring => ring.map(([lng, lat]) => new maps.LatLng(lat, lng)))),
        strokeColor: '#08734b', strokeWeight: 2, strokeOpacity: .95, fillColor: '#56a47b', fillOpacity: .14, clickable: false,
      })
      const overlays: MapOverlay[] = []
      const localized = toilets.map(toilet => localizeToiletMapItem(toilet, locale))
      for (const point of groupToiletsByCoordinate(localized, locale)) {
        const content = document.createElement('button')
        content.type = 'button'
        content.className = 'toilet-marker region-map-marker'
        content.title = point.displayGroupName || point.name || ''
        content.setAttribute('aria-label', `${point.displayGroupName || point.name || ''} ${point.count > 1 ? `(${point.count})` : ''}`)
        const pin = document.createElement('span')
        pin.className = 'toilet-marker-pin'
        pin.setAttribute('aria-hidden', 'true')
        const logo = document.createElement('img')
        logo.className = 'toilet-marker-logo'
        logo.src = '/toilet-marker-logo.svg'
        logo.alt = ''
        pin.append(logo)
        const label = document.createElement('span')
        label.className = 'toilet-marker-name'
        label.textContent = point.displayGroupName || point.name || ''
        content.append(pin, label)
        content.addEventListener('click', event => {
          event.stopPropagation()
          setSelected(point.toilets ?? localized.filter(toilet => toilet.id === point.id))
        })
        const overlay = createMapOverlay(map, { position: createMapCoordinate(map, point.latitude, point.longitude), content, yAnchor: 1, zIndex: 2 })
        overlay.setMap(map)
        overlays.push(overlay)
      }
      (map.raw as { fitBounds(bounds: unknown, options?: { top: number; right: number; bottom: number; left: number }): void }).fitBounds(
        new maps.LatLngBounds(new maps.LatLng(bounds.south, bounds.west), new maps.LatLng(bounds.north, bounds.east)),
        { top: 30, right: 30, bottom: 30, left: 30 },
      )
      cleanup = () => { overlays.forEach(overlay => overlay.setMap(null)); polygon.setMap(null); destroyMap(map) }
    }).catch(() => { if (!abort.signal.aborted) setError(true) })
    return () => { abort.abort(); cleanup?.() }
  }, [district, toilets, locale])

  return <div className="district-map-wrap">
    <div className="district-naver-map" ref={container} role="img" aria-label={`${district.name} boundary and toilets`} />
    {error && <p className="district-map-error" role="alert">{locale === 'ko' ? '지도를 불러오지 못했습니다. 아래 목록에서 화장실을 확인하세요.' : 'Map unavailable. Browse the toilet list below.'}</p>}
    {selected.length > 0 && <div className="district-map-selection">
      <button type="button" className="region-selection-close" onClick={() => setSelected([])} aria-label={locale === 'ko' ? '선택 닫기' : 'Close'}>×</button>
      <strong>{selected.length === 1 ? selected[0].displayGroupName || selected[0].name : `${selected.length} ${locale === 'ko' ? '개 화장실' : 'restrooms'}`}</strong>
      <div>{selected.map(toilet => <Link key={toilet.id} href={localizedPublicPath(regionToiletPath(toilets.find(item => item.id === toilet.id) ?? toilet), locale)!}>{toilet.name}<span>↗</span></Link>)}</div>
    </div>}
  </div>
}
