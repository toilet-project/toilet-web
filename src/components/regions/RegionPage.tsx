import { RegionExplorer } from './RegionExplorer'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Locale } from '../../i18n/locale'
import { SUPPORTED_LOCALES } from '../../i18n/locale'
import { localizedPublicPath } from '../../i18n/routes'
import { regionSeoCopy } from '../../i18n/regionSeoCopy'
import { socialMetadata } from '../../i18n/pageSeo'
import { localizeToiletMapItem } from '../../i18n/toiletTranslations'
import { regionToiletPathForDistrict } from '../../lib/regionToiletPath'
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
  const toilets = await getDistrictToilets(provinceCode, districtCode)
  const r = regionText(locale)
  const facilityLinks = toilets.map(toilet => ({
    id: toilet.id,
    name: localizeToiletMapItem(toilet, locale).name,
    // The durable dataset is already clipped to this precise district. Avoid
    // repeating nationwide polygon searches for every SEO facility link.
    href: localizedPublicPath(regionToiletPathForDistrict(toilet, locale, districtCode), locale)!,
  })).sort((left, right) => left.name.localeCompare(right.name, locale) || left.id - right.id)
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
