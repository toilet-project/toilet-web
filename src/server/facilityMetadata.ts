import type { Metadata } from 'next'
import type { ToiletDetailResponse } from '../api/toilets'
import type { Locale } from '../i18n/locale'
import { facilitySeoSignals } from '../i18n/facilitySeo'
import { facilityMetadataText, socialMetadata } from '../i18n/pageSeo'

export function facilityMetadata(detail: ToiletDetailResponse, locale: Locale, legacyAlias = false): Metadata {
  const seo = facilitySeoSignals(detail, locale)
  const { title, description } = facilityMetadataText(detail, locale)
  // Retain the existing exclusion for foreign legacy aliases; the canonical
  // facility page still uses translation eligibility, including missing data.
  const alias = legacyAlias && locale !== 'ko' && !seo.canonical.endsWith(`/toilet/${detail.id}`)
  return { title: { absolute: title }, description,
    robots: { ...seo.robots, index: seo.robots.index && !alias },
    alternates: { canonical: seo.canonical, languages: seo.languages },
    ...socialMetadata(title, description, seo.canonical, locale) }
}
