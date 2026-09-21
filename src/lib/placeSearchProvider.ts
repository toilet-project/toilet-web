import type { Locale } from '../i18n/locale'

export function placeSearchProvider(locale: Locale) {
  return locale === 'ko' ? 'kakao' : 'cloudflare'
}
