import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Locale } from '../../i18n/locale'
import { SUPPORTED_LOCALES } from '../../i18n/locale'
import { localizedPublicPath } from '../../i18n/routes'
import { regionSeoCopy } from '../../i18n/regionSeoCopy'
import { socialMetadata } from '../../i18n/pageSeo'
import { safeJsonLd, SITE_ORIGIN } from '../../lib/seo'
import { localizeToiletMapItem } from '../../i18n/toiletTranslations'
import { regionToiletPath } from '../../lib/regionToiletPath'
import { districtsIn, getDistrict, getProvince, localizedRegionPath, provinces, regionName, regionSnapshot } from '../../lib/regions'
import { codeFromRegionSegment, decodedRouteSegment } from '../../lib/urlName'
import { getDistrictToilets, getPreciseDistrict } from '../../server/regions'
import { SiteHeader } from '../SiteHeader'
import { SiteFooter } from '../SiteFooter'
import { RegionPicker } from './RegionPicker'
import { RegionAtlas } from './RegionAtlas'
import { DistrictNaverMap } from './DistrictNaverMap'
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

export async function RegionPage({ locale, parts }: { locale: Locale; parts: string[] }) {
  parts = normalizedParts(parts)
  const { province, district } = resolve(parts)
  const path = localizedRegionPath(locale, province?.code, district?.code)
  if (path !== `/regions${parts.length ? `/${parts.join('/')}` : ''}`) permanentRedirect(encodeURI(localizedPublicPath(path, locale)!))
  const preciseDistrict = district && province ? getPreciseDistrict(province.code, district.code) : null
  if (district && !preciseDistrict) throw new Error(`Missing precise boundary for ${district.code}`)
  const r = regionText(locale)
  const localized = (raw: string) => localizedPublicPath(raw, locale)!
  const areaName = district ? regionName(district, locale) : province ? regionName(province, locale) : r.nationalMap
  const { title, description } = regionSeoCopy(locale, { province: province ? regionName(province, locale) : undefined, district: district ? regionName(district, locale) : undefined })
  const pageUrl = encodeURI(SITE_ORIGIN + localized(path))
  const breadcrumbs = [
    { name: locale === 'ko' ? '급똥' : 'Geupddong', path: localized('/') },
    { name: r.nationalMap, path: localized('/regions') },
    ...(province ? [{ name: regionName(province, locale), path: localized(localizedRegionPath(locale, province.code)) }] : []),
    ...(district ? [{ name: regionName(district, locale), path: localized(path) }] : []),
  ]
  const structured = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'CollectionPage', '@id': `${pageUrl}#page`, url: pageUrl, name: title, description, inLanguage: locale, breadcrumb: { '@id': `${pageUrl}#breadcrumbs` } },
    { '@type': 'BreadcrumbList', '@id': `${pageUrl}#breadcrumbs`, itemListElement: breadcrumbs.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: encodeURI(SITE_ORIGIN + item.path) })) },
  ] }
  const count = (district?.count ?? province?.count ?? provinces.reduce((sum, item) => sum + item.count, 0)).toLocaleString(locale)
  const regions = province ? districtsIn(province.code) : provinces
  const toilets = district && province ? await getDistrictToilets(province.code, district.code) : []
  const facilityLinks = district ? toilets.map(toilet => ({
    id: toilet.id,
    name: localizeToiletMapItem(toilet, locale).name,
    href: localized(regionToiletPath(toilet, locale)),
  })).sort((left, right) => left.name.localeCompare(right.name, locale) || left.id - right.id) : []
  const sourceNote = <details className="region-source"><summary>{r.source}<span aria-hidden="true">ⓘ</span></summary><p><a href="https://github.com/DevMinGeonPark/mapcn-kr">SGIS · 행정안전부 / vuski/admdongkor / mapcn-kr</a> (CC BY 4.0).<br />{new Date(regionSnapshot.generatedAt).toLocaleDateString(locale)} · {regionSnapshot.unassigned.toLocaleString(locale)} {r.outsideBoundary}.</p></details>
  return <div className="region-site-shell is-region-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(structured) }} />
    <SiteHeader path={path} languagePaths={Object.fromEntries(SUPPORTED_LOCALES.map(language => [language,
      localizedPublicPath(localizedRegionPath(language, province?.code, district?.code), language)!]))} />
    <main className={`region-main${!province ? ' is-national' : ''}`}>
      <nav className="region-breadcrumbs" aria-label="Breadcrumb">{breadcrumbs.map((item, index) => <span key={item.path}>{index > 0 && <span aria-hidden="true"> / </span>}{index === breadcrumbs.length - 1 ? <span aria-current="page">{item.name}</span> : <Link href={item.path}>{item.name}</Link>}</span>)}</nav>
      <div className="region-hero">
        <div className="region-hero-copy"><span className="region-eyebrow">{r.explore}</span>
          <div className="region-hero-heading"><h1>{title}</h1><span className="region-hero-count">{r.totalCount.replace('{count}', count)}</span></div>
          <p>{r.intro}</p>
        </div>
        {!district && <RegionPicker title={r.allRegions} label={province ? r.chooseDistrict : r.chooseProvince} countLabel={r.toilets} closeLabel={r.closeSelection}
          areas={regions.map(region => ({ code: region.code, name: regionName(region, locale), count: region.count.toLocaleString(locale), href: localized(localizedRegionPath(locale, province?.code ?? region.code, province ? region.code : undefined)) }))} />}
        <p className="region-mobile-hint">{district ? r.mobileMarkerHint : r.mobileExploreHint}</p>
      </div>
      {district && province ? <section className="region-district-layout" aria-label={title}>
        <div className="region-district-map-card"><div className="region-card-heading"><span className="region-eyebrow">{r.locationMap}</span><h2>{areaName}</h2></div><DistrictNaverMap district={preciseDistrict!} toilets={toilets} locale={locale} />
          {facilityLinks.length > 0 && <details className="region-facility-directory"><summary>{r.restroomList} ({facilityLinks.length.toLocaleString(locale)})</summary>
            <nav aria-label={r.nearby}><ul>{facilityLinks.map(toilet => <li key={toilet.id}><a href={toilet.href}>{toilet.name}</a></li>)}</ul></nav>
          </details>}{sourceNote}</div>
      </section> : <section className="region-discovery-layout"><div className="region-atlas-card"><RegionAtlas locale={locale} provinceCode={province?.code} />{sourceNote}</div></section>}
    </main>
    <SiteFooter hint={r.intro} />
  </div>
}
