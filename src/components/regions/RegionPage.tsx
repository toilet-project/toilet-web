import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { Locale } from '../../i18n/locale'
import { SUPPORTED_LOCALES } from '../../i18n/locale'
import { localizedPublicPath } from '../../i18n/routes'
import { districtsIn, getDistrict, getProvince, provinces, regionName, regionPath, regionSnapshot } from '../../lib/regions'
import { getDistrictToilets } from '../../server/regions'
import { SiteHeader } from '../SiteHeader'
import { SiteFooter } from '../SiteFooter'
import { RegionPicker } from './RegionPicker'
import { RegionAtlas } from './RegionAtlas'
import { DistrictNaverMap } from './DistrictNaverMap'
import { regionText } from './regionText'

function resolve(parts: string[]) {
  if (parts.length > 2) notFound()
  const province = parts[0] ? getProvince(parts[0]) : null
  if (parts[0] && !province) notFound()
  const district = parts[1] && province ? getDistrict(province.code, parts[1]) : null
  if (parts[1] && !district) notFound()
  return { province, district }
}

export function regionMetadata(locale: Locale, parts: string[]): Metadata {
  const { province, district } = resolve(parts)
  const r = regionText(locale)
  const title = [district && regionName(district, locale), province && regionName(province, locale), r.regions].filter(Boolean).join(' · ')
  const path = regionPath(province?.code, district?.code)
  const canonical = localizedPublicPath(path, locale)!
  const description = district ? `${regionName(district, locale)} · ${district.count.toLocaleString(locale)} ${r.toilets}. ${r.intro}` : r.intro
  return { title: { absolute: `${title} | ${locale === 'ko' ? '급똥' : 'Geupddong'}` }, description,
    alternates: { canonical, languages: Object.fromEntries(SUPPORTED_LOCALES.map(language => [language, localizedPublicPath(path, language)!])) },
    openGraph: { title, description, url: canonical, type: 'website', images: ['/og-image.png'] } }
}

export async function RegionPage({ locale, parts }: { locale: Locale; parts: string[] }) {
  const { province, district } = resolve(parts)
  const r = regionText(locale)
  const path = regionPath(province?.code, district?.code)
  const localized = (raw: string) => localizedPublicPath(raw, locale)!
  const title = district ? regionName(district, locale) : province ? regionName(province, locale) : r.nationalMap
  const count = (district?.count ?? province?.count ?? provinces.reduce((sum, item) => sum + item.count, 0)).toLocaleString(locale)
  const regions = province ? districtsIn(province.code) : provinces
  let toilets = [] as Awaited<ReturnType<typeof getDistrictToilets>>
  let failed = false
  if (district && province) {
    try { toilets = await getDistrictToilets(province.code, district.code) }
    catch { failed = true }
  }
  const sourceNote = <details className="region-source"><summary>{r.source}<span aria-hidden="true">ⓘ</span></summary><p><a href="https://github.com/DevMinGeonPark/mapcn-kr">SGIS · 행정안전부 / vuski/admdongkor / mapcn-kr</a> (CC BY 4.0).<br />{new Date(regionSnapshot.generatedAt).toLocaleDateString(locale)} · {regionSnapshot.unassigned.toLocaleString(locale)} {r.outsideBoundary}.</p></details>
  return <div className="region-site-shell is-region-page">
    <SiteHeader path={path} />
    <main className={`region-main${!province ? ' is-national' : ''}`}>
      {province && <nav className="region-breadcrumbs" aria-label="Breadcrumb"><Link href={localized('/regions')}>{r.back}</Link>{province && <><span>/</span><Link href={localized(regionPath(province.code))}>{regionName(province, locale)}</Link></>}{district && <><span>/</span><span aria-current="page">{regionName(district, locale)}</span></>}</nav>}
      <div className="region-hero">
        <div className="region-hero-copy"><span className="region-eyebrow">{r.explore}</span>
          <div className="region-hero-heading"><h1>{title}</h1><span className="region-hero-count">{r.totalCount.replace('{count}', count)}</span></div>
          <p>{r.intro}</p>
        </div>
        {!district && <RegionPicker title={r.allRegions} label={province ? r.chooseDistrict : r.chooseProvince} countLabel={r.toilets} closeLabel={r.closeSelection}
          areas={regions.map(region => ({ code: region.code, name: regionName(region, locale), count: region.count.toLocaleString(locale), href: localized(regionPath(province?.code ?? region.code, province ? region.code : undefined)) }))} />}
        <p className="region-mobile-hint">{district ? r.mobileMarkerHint : r.mobileExploreHint}</p>
      </div>
      {district && province ? <section className="region-district-layout" aria-label={title}>
        <div className="region-district-map-card"><div className="region-card-heading"><span className="region-eyebrow">{r.locationMap}</span><h2>{title}</h2></div><DistrictNaverMap district={district} toilets={toilets} locale={locale} failed={failed} />{sourceNote}</div>
      </section> : <section className="region-discovery-layout"><div className="region-atlas-card"><RegionAtlas locale={locale} provinceCode={province?.code} />{sourceNote}</div></section>}
    </main>
    <SiteFooter hint={r.intro} />
  </div>
}
