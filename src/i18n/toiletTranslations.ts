import type { Locale } from './locale'
import type { ToiletDetailResponse, ToiletMapItemResponse, ToiletMapSearchResponse, ToiletTranslationText } from '../api/toilets'

type TranslatableToilet = {
  name: string
  roadAddress?: string | null
  jibunAddress?: string | null
  translations?: Record<string, ToiletTranslationText>
}

type TranslationField = 'name' | 'roadAddress' | 'jibunAddress'
type DisplayCandidate = { locale: 'exact' | 'zh-CN' | 'en'; text: ToiletTranslationText }

function normalizedLocale(locale: string) {
  return locale.trim().toLowerCase().replace('_', '-')
}

function isTraditionalChinese(locale: string) {
  const normalized = normalizedLocale(locale)
  return normalized === 'zh-tw' || normalized === 'zh-hk'
}

export function toiletTranslation<T extends TranslatableToilet>(toilet: T, locale: Locale | string): ToiletTranslationText | null {
  if (locale === 'ko') return null
  const normalized = normalizedLocale(locale)
  const entry = Object.entries(toilet.translations ?? {}).find(([key]) => key.toLowerCase().replace('_', '-') === normalized)
  // SEO and locale completion require an exact regional Chinese translation.
  const translation = entry?.[1] ?? (normalized.startsWith('zh-') ? undefined : toilet.translations?.[normalized.split('-')[0]])
  return translation ?? null
}

function displayCandidates<T extends TranslatableToilet>(toilet: T, locale: Locale | string): DisplayCandidate[] {
  const exact = toiletTranslation(toilet, locale)
  const candidates: DisplayCandidate[] = exact ? [{ locale: 'exact', text: exact }] : []
  if (isTraditionalChinese(locale)) {
    const simplified = toiletTranslation(toilet, 'zh-CN')
    const english = toiletTranslation(toilet, 'en')
    if (simplified) candidates.push({ locale: 'zh-CN', text: simplified })
    if (english) candidates.push({ locale: 'en', text: english })
  }
  return candidates
}

function displayField(candidates: DisplayCandidate[], field: TranslationField) {
  return candidates.find(candidate => candidate.text[field]?.trim())
}

/** Only visible facility text falls back; this does not create a regional translation for SEO. */
export function fallbackToiletDisplayLanguages<T extends TranslatableToilet>(toilet: T, locale: Locale | string): Array<'zh-CN' | 'en'> {
  if (!isTraditionalChinese(locale)) return []
  const candidates = displayCandidates(toilet, locale)
  const display = localizeToilet(toilet, locale)
  const addressField = display.roadAddress?.trim() ? 'roadAddress' : 'jibunAddress'
  const sources = [displayField(candidates, 'name')?.locale, displayField(candidates, addressField)?.locale]
  return [...new Set(sources.filter((source): source is 'zh-CN' | 'en' => source === 'zh-CN' || source === 'en'))]
}

export function localizeToilet<T extends TranslatableToilet>(toilet: T, locale: Locale | string): T {
  const candidates = displayCandidates(toilet, locale)
  if (!candidates.length) return toilet
  const name = displayField(candidates, 'name')?.text.name?.trim()
  const roadAddress = displayField(candidates, 'roadAddress')?.text.roadAddress?.trim()
  const jibunAddress = displayField(candidates, 'jibunAddress')?.text.jibunAddress?.trim()
  return {
    ...toilet,
    name: name || toilet.name,
    ...('roadAddress' in toilet && roadAddress ? { roadAddress } : {}),
    ...('jibunAddress' in toilet && jibunAddress ? { jibunAddress } : {}),
  }
}

export function localizeToiletMapItem(toilet: ToiletMapItemResponse, locale: Locale | string): ToiletMapItemResponse {
  const localized = localizeToilet(toilet, locale)
  if (locale === 'ko') return localized
  const normalized = normalizedLocale(locale)
  const groupEntry = Object.entries(toilet.displayGroupTranslations ?? {}).find(([key]) => key.toLowerCase().replace('_', '-') === normalized)
  const translations = toilet.displayGroupTranslations ?? {}
  const groupFallback = (language: string) => Object.entries(translations)
    .find(([key]) => normalizedLocale(key) === language)?.[1]
  const displayGroupName = [groupEntry?.[1],
    ...(isTraditionalChinese(locale) ? [groupFallback('zh-cn'), groupFallback('en')] : []),
    ...(normalized.startsWith('zh-') ? [] : [translations[normalized.split('-')[0]]]),
  ].find(value => value?.trim())
  return displayGroupName?.trim() ? { ...localized, displayGroupName: displayGroupName.trim() } : localized
}

export function localizeToiletDetail(toilet: ToiletDetailResponse, locale: Locale | string): ToiletDetailResponse {
  return localizeToilet(toilet, locale)
}

export function localizeToiletMapSearch(response: ToiletMapSearchResponse, locale: Locale | string): ToiletMapSearchResponse {
  if (locale === 'ko') return response
  return { ...response, toilets: response.toilets.map(toilet => localizeToiletMapItem(toilet, locale)) }
}
