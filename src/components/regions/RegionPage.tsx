import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import type { Locale } from '../../i18n/locale'
import { SUPPORTED_LOCALES } from '../../i18n/locale'
import { localizedPublicPath } from '../../i18n/routes'
import { freeRestroomSearchPrompt } from '../../i18n/searchCopy'
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
  const r = regionText(locale)
  const title = [district && regionName(district, locale), province && regionName(province, locale), r.regions].filter(Boolean).join(' · ')
  const path = localizedRegionPath(locale, province?.code, district?.code)
  const canonical = localizedPublicPath(path, locale)!
  const description = `${district ? `${regionName(district, locale)} · ${district.count.toLocaleString(locale)} ${r.toilets}. ` : ''}${r.intro}${locale === 'ko' ? '' : ` ${freeRestroomSearchPrompt(locale)}`}`
  return { title: { absolute: `${title} | ${locale === 'ko' ? '급똥' : 'Geupddong'}` }, description,
    alternates: { canonical, languages: Object.fromEntries(SUPPORTED_LOCALES.map(language => [language,
      localizedPublicPath(localizedRegionPath(language, province?.code, district?.code), language)!])) },
    openGraph: { title, description, url: canonical, type: 'website', images: ['/og-image.png'] } }
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
  const title = district ? regionName(district, locale) : province ? regionName(province, locale) : r.nationalMap
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
    <SiteHeader path={path} languagePaths={Object.fromEntries(SUPPORTED_LOCALES.map(language => [language,
      localizedPublicPath(localizedRegionPath(language, province?.code, district?.code), language)!]))} />
    <main className={`region-main${!province ? ' is-national' : ''}`}>
      {province && <nav className="region-breadcrumbs" aria-label="Breadcrumb"><Link href={localized('/regions')}>{r.back}</Link>{province && <><span>/</span><Link href={localized(localizedRegionPath(locale, province.code))}>{regionName(province, locale)}</Link></>}{district && <><span>/</span><span aria-current="page">{regionName(district, locale)}</span></>}</nav>}
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
        <div className="region-district-map-card"><div className="region-card-heading"><span className="region-eyebrow">{r.locationMap}</span><h2>{title}</h2></div><DistrictNaverMap district={preciseDistrict!} toilets={toilets} locale={locale} />
          {facilityLinks.length > 0 && <details className="region-facility-directory"><summary>{r.restroomList} ({facilityLinks.length.toLocaleString(locale)})</summary>
            <nav aria-label={r.nearby}><ul>{facilityLinks.map(toilet => <li key={toilet.id}><a href={toilet.href}>{toilet.name}</a></li>)}</ul></nav>
          </details>}{sourceNote}</div>
      </section> : <section className="region-discovery-layout"><div className="region-atlas-card"><RegionAtlas locale={locale} provinceCode={province?.code} />{sourceNote}</div></section>}
    </main>
    <SiteFooter hint={r.intro} />
  </div>
}
