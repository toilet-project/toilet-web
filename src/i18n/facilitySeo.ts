import type { ToiletDetailResponse } from '../api/toilets'
import { regionToiletPath } from '../lib/regionToiletPath.ts'
import { SUPPORTED_LOCALES, type Locale } from './locale.ts'
import { ENGLISH_UI_ENABLED } from './feature.ts'
import { localizedPublicPath } from './routes.ts'
import { toiletTranslation } from './toiletTranslations.ts'

type Facility = Pick<ToiletDetailResponse, 'id' | 'name' | 'latitude' | 'longitude' | 'translations'>

/** The public API supplies only translations current with the Korean source. */
export function indexableFacilityLocales(detail: Facility): Locale[] {
  return SUPPORTED_LOCALES.filter(locale => {
    if (locale === 'ko') return true
    const text = toiletTranslation(detail, locale)
    return Boolean(text?.name?.trim() && (text.roadAddress?.trim() || text.jibunAddress?.trim()))
  })
}

export function facilitySeoSignals(detail: Facility, locale: Locale, foreignUiEnabled = ENGLISH_UI_ENABLED) {
  const locales = foreignUiEnabled ? indexableFacilityLocales(detail) : (['ko'] as Locale[])
  const eligible = locales.includes(locale)
  const canonicalLocale = eligible ? locale : 'ko'
  const pathFor = (language: Locale) => localizedPublicPath(regionToiletPath(detail, language), language)!
  return {
    eligible,
    canonical: pathFor(canonicalLocale),
    languages: Object.fromEntries(locales.map(language => [language, pathFor(language)])),
    robots: { index: process.env.SITE_INDEXABLE === 'true' && eligible, follow: true },
  }
}
