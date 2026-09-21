import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Locale } from '../../i18n/locale'
import { SUPPORTED_LOCALES } from '../../i18n/locale'
import { localizedPublicPath } from '../../i18n/routes'
import { localizeToiletDetail } from '../../i18n/toiletTranslations'
import { getDistrict } from '../../lib/regions'
import { parseRegionToiletSegment, regionToiletPath } from '../../lib/regionToiletPath'
import { getToilet } from '../../server/toilets'
import { ToiletRouteBridge } from '../ToiletRouteBridge'
import { englishPlaceData } from '../../i18n/seo'
import { placeData, safeJsonLd } from '../../lib/seo'

export async function loadRegionToilet(province: string, district: string, facility: string, locale: Locale) {
  if (!getDistrict(province, district)) notFound()
  const id = parseRegionToiletSegment(facility)
  if (!id) notFound()
  const detail = await getToilet(String(id))
  if (!detail) notFound()
  const canonicalPath = regionToiletPath(detail)
  const suppliedPath = `/regions/${province}/${district}/toilet/${facility}`
  if (canonicalPath !== suppliedPath) permanentRedirect(localizedPublicPath(canonicalPath, locale)!)
  return detail
}

export async function regionToiletMetadata(province: string, district: string, facility: string, locale: Locale): Promise<Metadata> {
  const detail = await loadRegionToilet(province, district, facility, locale)
  const localized = localizeToiletDetail(detail, locale)
  const path = regionToiletPath(detail)
  const canonical = localizedPublicPath(path, locale)!
  return { title: { absolute: `${localized.name} | ${locale === 'ko' ? '급똥' : 'Geupddong'}` },
    description: localized.roadAddress || localized.jibunAddress || localized.name,
    alternates: { canonical, languages: Object.fromEntries(SUPPORTED_LOCALES.map(language => [language, localizedPublicPath(path, language)!])) },
    openGraph: { title: localized.name, url: canonical, type: 'website', images: ['/og-image.png'] } }
}

export async function RegionToiletPage({ province, district, facility, locale }: { province: string; district: string; facility: string; locale: Locale }) {
  const detail = await loadRegionToilet(province, district, facility, locale)
  const path = localizedPublicPath(regionToiletPath(detail), locale)!
  const structured = locale === 'ko' ? placeData(detail) : locale === 'en' ? englishPlaceData(detail) : null
  return <>{structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(structured) }} />}
    <ToiletRouteBridge detail={detail} locale={locale} path={path} /></>
}
