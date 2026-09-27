import type { RegionMarkerItem } from './regionDisplayItems'
import type { Locale } from '../i18n/locale'
import type { RegionGeometry } from './regions'
import { regionNavigationTarget } from './regionNavigation'
import boundaries from '../../data/regions/boundary-assets.json' with { type: 'json' }
import atlases from '../../data/regions/atlas-assets.json' with { type: 'json' }

const shapes = new Map<string, Promise<RegionGeometry>>()
const pending = new Map<string, { at: number; promise: Promise<RegionMarkerItem[]> }>()
const images = new Map<string, HTMLImageElement>()

export function loadDistrictBoundary(code: string) {
  let promise = shapes.get(code)
  if (!promise) {
    const asset = boundaries[code as keyof typeof boundaries]
    if (!asset) return Promise.reject(new Error('Unknown district'))
    promise = fetch(asset.href).then(async response => {
      if (!response.ok) throw new Error('Boundary unavailable')
      return await response.json() as RegionGeometry
    }).catch(error => { shapes.delete(code); throw error })
    shapes.set(code, promise)
  }
  return promise
}

export function loadDistrictMarkers(code: string, locale: Locale) {
  const key = `${code}:${locale}`, existing = pending.get(key)
  // Reuse only a short intent prefetch; revisiting must check the R2 revision.
  if (existing && Date.now() - existing.at < 3000) return existing.promise
  const promise = fetch(`/api/public/region-markers/${code}?locale=${locale}`, { cache: 'no-store', signal: AbortSignal.timeout(25_000) })
    .then(async response => {
      if (!response.ok) throw new Error('District markers unavailable')
      const body = await response.json() as { toilets: RegionMarkerItem[] }
      if (!Array.isArray(body.toilets)) throw new Error('Invalid district markers')
      return body.toilets
    }).catch(error => { pending.delete(key); throw error })
  pending.set(key, { at: Date.now(), promise })
  if (pending.size > 8) pending.delete(pending.keys().next().value!)
  return promise
}

export function preloadRegion(href: string) {
  const target = regionNavigationTarget(href)
  if (!target || typeof window === 'undefined') return
  const { province, district, locale } = target
  // Prepare while choosing a province too, so a quick province → district tap
  // does not wait for configuration and the external SDK in series.
  void import('./mapProvider').then(module => module.prepareNaverMap(locale)).catch(() => {})
  if (district) {
    void loadDistrictBoundary(district.code).catch(() => {})
    void loadDistrictMarkers(district.code, locale).catch(() => {})
  } else {
    const src = province ? atlases.provinces[province.code as keyof typeof atlases.provinces] : atlases.national
    if (!images.has(src)) { const image = new Image(); images.set(src, image); image.src = src }
  }
}
