import { RegionExplorer } from './RegionExplorer'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Locale } from '../../i18n/locale'
import { SUPPORTED_LOCALES } from '../../i18n/locale'
import { localizedPublicPath } from '../../i18n/routes'
import { regionSeoCopy } from '../../i18n/regionSeoCopy'
import { socialMetadata } from '../../i18n/pageSeo'
import { regionDirectoryEntries } from '../../lib/regionDirectory'
import { getDistrict, getProvince, localizedRegionPath, regionName } from '../../lib/regions'
import { codeFromRegionSegment, decodedRouteSegment } from '../../lib/urlName'
import { regionText } from './regionText'

function resolve(parts: string[]) {
  if (parts.length > 2) notFound()
  const province = parts[0] ? getProvince(codeFromRegionSegment(parts[0], 2) ?? '') : null
  if (parts[0] && !province) notFound()
  const district = parts[1] && province ? getDistrict(province.code, codeFromRegionSegment(parts[1], 5) ?? '') : null
  if (parts[1] && !district) notFound()
  return { province, district }
}

function normalizedParts(parts: string[]) {
  const decoded = parts.map(decodedRouteSegment)
  if (decoded.some(part => part === null)) notFound()
  return decoded as string[]
}

export function regionMetadata(locale: Locale, parts: string[]): Metadata {
  parts = normalizedParts(parts)
  const { province, district } = resolve(parts)
  const { title, description } = regionSeoCopy(locale, {
    province: province ? regionName(province, locale) : undefined,
    district: district ? regionName(district, locale) : undefined,
  })
  const path = localizedRegionPath(locale, province?.code, district?.code)
  const canonical = localizedPublicPath(path, locale)!
  return { title: { absolute: `${title} | ${locale === 'ko' ? '급똥' : 'Geupddong'}` }, description,
    alternates: { canonical, languages: Object.fromEntries(SUPPORTED_LOCALES.map(language => [language,
      localizedPublicPath(localizedRegionPath(language, province?.code, district?.code), language)!])) },
    ...socialMetadata(`${title} | ${locale === 'ko' ? '급똥' : 'Geupddong'}`, description, canonical, locale) }
}

async function DistrictDirectory({ locale, provinceCode, districtCode }: {
  locale: Locale; provinceCode: string; districtCode: string
}) {
  const { getDistrictToilets } = await import('../../server/regions')
  // The geographic page exists even when its data service is unavailable.
  // Keep the streamed map shell usable; its separate marker request exposes a
  // retryable error. Failed reads are never stored as an empty district.
  const toilets = await getDistrictToilets(provinceCode, districtCode).catch(error => {
    console.error('Region directory unavailable', districtCode, error)
    return null
  })
  if (!toilets) return null
  const r = regionText(locale)
  const facilityLinks = regionDirectoryEntries(toilets, locale, districtCode)
  return <>
    {facilityLinks.length > 0 && <details className="region-facility-directory"><summary>{r.restroomList} ({facilityLinks.length.toLocaleString(locale)})</summary>
      <nav aria-label={r.nearby}><ul>{facilityLinks.map(toilet => <li key={toilet.id}><a href={toilet.href}>{toilet.name}</a></li>)}</ul></nav>
    </details>}</>
}

export async function RegionPage({ locale, parts }: { locale: Locale; parts: string[] }) {
  parts = normalizedParts(parts)
  const { province, district } = resolve(parts)
  const path = localizedRegionPath(locale, province?.code, district?.code)
  if (path !== `/regions${parts.length ? `/${parts.join('/')}` : ''}`) permanentRedirect(encodeURI(localizedPublicPath(path, locale)!))
  return <RegionExplorer initialLocale={locale} initialHref={localizedPublicPath(path, locale)!} initialDistrictCode={district?.code}
    directory={district && province ? <Suspense fallback={null}><DistrictDirectory locale={locale} provinceCode={province.code} districtCode={district.code} /></Suspense> : undefined} />
}
