import type { Locale } from './locale'
import type { ToiletDetailResponse, ToiletMapItemResponse, ToiletMapSearchResponse, ToiletTranslationText } from '../api/toilets'

type TranslatableToilet = {
  name: string
  roadAddress?: string | null
  jibunAddress?: string | null
  translations?: Record<string, ToiletTranslationText>
}

export function toiletTranslation<T extends TranslatableToilet>(toilet: T, locale: Locale | string): ToiletTranslationText | null {
  if (locale === 'ko') return null
  const normalized = locale.trim().toLowerCase().replace('_', '-')
  const entry = Object.entries(toilet.translations ?? {}).find(([key]) => key.toLowerCase().replace('_', '-') === normalized)
  // Chinese regions require an exact match; never substitute another region's text.
  const translation = entry?.[1] ?? (normalized.startsWith('zh-') ? undefined : toilet.translations?.[normalized.split('-')[0]])
  return translation?.name?.trim() ? translation : null
}

export function localizeToilet<T extends TranslatableToilet>(toilet: T, locale: Locale | string): T {
  const translation = toiletTranslation(toilet, locale)
  if (!translation) return toilet
  return {
    ...toilet,
    name: translation.name.trim(),
    ...('roadAddress' in toilet && translation.roadAddress?.trim() ? { roadAddress: translation.roadAddress.trim() } : {}),
    ...('jibunAddress' in toilet && translation.jibunAddress?.trim() ? { jibunAddress: translation.jibunAddress.trim() } : {}),
  }
}

export function localizeToiletMapItem(toilet: ToiletMapItemResponse, locale: Locale | string): ToiletMapItemResponse {
  const localized = localizeToilet(toilet, locale)
  if (locale === 'ko') return localized
  const normalized = locale.trim().toLowerCase().replace('_', '-')
  const groupEntry = Object.entries(toilet.displayGroupTranslations ?? {}).find(([key]) => key.toLowerCase().replace('_', '-') === normalized)
  const displayGroupName = groupEntry?.[1]
    ?? (normalized.startsWith('zh-') ? undefined : toilet.displayGroupTranslations?.[normalized.split('-')[0]])
  return displayGroupName?.trim() ? { ...localized, displayGroupName: displayGroupName.trim() } : localized
}

export function localizeToiletDetail(toilet: ToiletDetailResponse, locale: Locale | string): ToiletDetailResponse {
  return localizeToilet(toilet, locale)
}

export function localizeToiletMapSearch(response: ToiletMapSearchResponse, locale: Locale | string): ToiletMapSearchResponse {
  if (locale === 'ko') return response
  return { ...response, toilets: response.toilets.map(toilet => localizeToiletMapItem(toilet, locale)) }
}
