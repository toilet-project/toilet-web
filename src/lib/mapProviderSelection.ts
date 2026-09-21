import type { Locale } from '../i18n/locale'

export type MapProvider = 'kakao' | 'naver'
export type MapProviderPreference = 'auto' | MapProvider
export type NaverMapLanguage = 'ko' | 'en' | 'ja' | 'zh'

const NAVER_LOGICAL_LEVEL_OFFSET = 21

export function resolveMapProvider(locale: Locale, preference: MapProviderPreference = 'auto'): MapProvider {
  if (preference !== 'auto') return preference
  return locale === 'ko' ? 'kakao' : 'naver'
}

// The SDK has one Chinese map language; UI and facility translations still retain
// their separate mainland, Taiwan and Hong Kong locale codes.
export function naverMapLanguageForLocale(locale: Locale): NaverMapLanguage {
  if (locale === 'ko' || locale === 'en' || locale === 'ja') return locale
  return 'zh'
}

export function naverMapLanguageNeedsReload(loaded: NaverMapLanguage | null, requested: NaverMapLanguage) {
  return loaded !== null && loaded !== requested
}

export function mapSdkIdentity(locale: Locale, preference: MapProviderPreference = 'auto') {
  return resolveMapProvider(locale, preference) === 'kakao' ? 'kakao' : `naver:${naverMapLanguageForLocale(locale)}`
}

export function naverZoomFromLevel(level: number) {
  return Math.max(5, Math.min(21, NAVER_LOGICAL_LEVEL_OFFSET - Math.round(level)))
}

export function mapLevelFromNaverZoom(zoom: number) {
  return Math.max(1, NAVER_LOGICAL_LEVEL_OFFSET - Math.round(zoom))
}
