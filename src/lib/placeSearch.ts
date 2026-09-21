import { searchCloudflarePlaces } from '../api/placeSearch'
import type { Locale } from '../i18n/locale'
import { searchKakaoPlaces } from './kakaoMap'
import { placeSearchProvider } from './placeSearchProvider'
import type { PlaceSearchResult } from './placeSearchTypes'

export function searchPlaces(keyword: string, locale: Locale, signal?: AbortSignal): Promise<PlaceSearchResult[]> {
  if (placeSearchProvider(locale) === 'cloudflare') return searchCloudflarePlaces(keyword, locale, signal)
  return searchKakaoPlaces(keyword)
}
