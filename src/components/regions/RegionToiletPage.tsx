import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Locale } from '../../i18n/locale'
import { facilityMetadata } from '../../server/facilityMetadata'
import { localizedPublicPath } from '../../i18n/routes'
import { getDistrict } from '../../lib/regions'
import { codeFromRegionSegment, decodedRouteSegment } from '../../lib/urlName'
import { parseRegionToiletSegment, regionToiletPath } from '../../lib/regionToiletPath'
import { getToilet } from '../../server/toilets'
import { ToiletRouteBridge } from '../ToiletRouteBridge'
import { localizedPlaceData } from '../../i18n/pageSeo'
import { safeJsonLd } from '../../lib/seo'

export async function loadRegionToilet(province: string, district: string, facility: string) {
  province = decodedRouteSegment(province) ?? ''
  district = decodedRouteSegment(district) ?? ''
  facility = decodedRouteSegment(facility) ?? ''
  if (!getDistrict(codeFromRegionSegment(province, 2) ?? '', codeFromRegionSegment(district, 5) ?? '')) notFound()
  const id = parseRegionToiletSegment(facility)
  if (!id) notFound()
  const detail = await getToilet(String(id))
  if (!detail) notFound()
  return detail
}

export async function regionToiletMetadata(province: string, district: string, facility: string, locale: Locale): Promise<Metadata> {
  const detail = await loadRegionToilet(province, district, facility)
  return facilityMetadata(detail, locale)
}

export async function RegionToiletPage({ province, district, facility, locale }: { province: string; district: string; facility: string; locale: Locale }) {
  const detail = await loadRegionToilet(province, district, facility)
  province = decodedRouteSegment(province) ?? ''
  district = decodedRouteSegment(district) ?? ''
  facility = decodedRouteSegment(facility) ?? ''
  const canonicalPath = regionToiletPath(detail, locale)
  if (canonicalPath !== `/regions/${province}/${district}/toilet/${facility}`) permanentRedirect(encodeURI(localizedPublicPath(canonicalPath, locale)!))
  const path = localizedPublicPath(canonicalPath, locale)!
  const structured = localizedPlaceData(detail, locale)
  return <>{structured && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(structured) }} />}
    <ToiletRouteBridge detail={detail} locale={locale} path={path} /></>
}
