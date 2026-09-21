import type { Locale } from '../i18n/locale'

export type MapProvider = 'kakao' | 'naver'
export type MapProviderPreference = 'auto' | MapProvider

const NAVER_LOGICAL_LEVEL_OFFSET = 21

export function resolveMapProvider(locale: Locale, preference: MapProviderPreference = 'auto'): MapProvider {
  if (preference !== 'auto') return preference
  return locale === 'en' ? 'naver' : 'kakao'
}

export function naverZoomFromLevel(level: number) {
  return Math.max(5, Math.min(21, NAVER_LOGICAL_LEVEL_OFFSET - Math.round(level)))
}

export function mapLevelFromNaverZoom(zoom: number) {
  return Math.max(1, NAVER_LOGICAL_LEVEL_OFFSET - Math.round(zoom))
}
