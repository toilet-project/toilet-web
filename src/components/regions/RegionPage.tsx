import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { Locale } from '../../i18n/locale'
import { SUPPORTED_LOCALES } from '../../i18n/locale'
import { localizedPublicPath } from '../../i18n/routes'
import { localizeToiletMapItem } from '../../i18n/toiletTranslations'
import { getDistrict, getProvince, districtsIn, provinces, regionName, regionPath, regionSnapshot } from '../../lib/regions'
import { regionToiletPath } from '../../lib/regionToiletPath'
import { getDistrictToilets } from '../../server/regions'
import { SiteHeader } from '../SiteHeader'
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
  const title = district ? regionName(district, locale) : province ? regionName(province, locale) : r.regions
  let toilets = [] as Awaited<ReturnType<typeof getDistrictToilets>>
  let failed = false
  if (district && province) {
    try { toilets = await getDistrictToilets(province.code, district.code) }
    catch { failed = true }
  }
  const options = province ? districtsIn(province.code) : provinces
  const visible = toilets.map(toilet => localizeToiletMapItem(toilet, locale))
  const itemList = district ? { '@context': 'https://schema.org', '@type': 'ItemList', name: title,
    itemListElement: visible.map((toilet, index) => ({ '@type': 'ListItem', position: index + 1, name: toilet.name,
      url: `https://geupddong.com${localized(regionToiletPath(toilets[index]))}` })) } : null
  return <div className="region-site-shell">
    <SiteHeader path={path} />
    <main className="region-main">
      <nav className="region-breadcrumbs" aria-label="Breadcrumb"><Link href={localized('/regions')}>{r.back}</Link>{province && <><span>/</span><Link href={localized(regionPath(province.code))}>{regionName(province, locale)}</Link></>}{district && <><span>/</span><span aria-current="page">{regionName(district, locale)}</span></>}</nav>
      <div className="region-hero"><div><span className="region-eyebrow">EXPLORE KOREA</span><h1>{title}</h1><p>{r.intro}</p></div><div className="region-hero-stat"><strong>{(district?.count ?? province?.count ?? provinces.reduce((sum, item) => sum + item.count, 0)).toLocaleString(locale)}</strong><span>{district || province ? `${title} · ${r.toilets}` : r.total}</span></div></div>
      {district && province ? <section className="region-district-layout" aria-label={title}>
        <div className="region-district-map-card"><div className="region-card-heading"><span className="region-eyebrow">LOCATION MAP</span><h2>{title}</h2><p>{r.nearby} · {visible.length.toLocaleString(locale)} {r.toilets}</p></div><DistrictNaverMap district={district} toilets={toilets} locale={locale} /></div>
        <div className="region-toilet-card"><div className="region-card-heading"><span className="region-eyebrow">RESTROOMS</span><h2>{r.nearby}</h2><p>{visible.length.toLocaleString(locale)} {r.toilets}</p></div>{failed ? <p role="alert" className="region-empty">{r.error}</p> : visible.length === 0 ? <p className="region-empty">{r.empty}</p> : <div className="region-toilet-list">{visible.map((toilet, index) => <Link key={toilet.id} href={localized(regionToiletPath(toilets[index]))} className="region-toilet-row"><span className="region-toilet-index">{String(index + 1).padStart(2, '0')}</span><span><strong>{toilet.displayGroupName || toilet.name}</strong>{toilet.displayGroupName && <small>{toilet.name}</small>}</span><span aria-hidden="true">↗</span></Link>)}</div>}</div>
      </section> : <section className="region-discovery-layout"><div className="region-atlas-card"><div className="region-card-heading"><span className="region-eyebrow">INTERACTIVE ATLAS</span><h2>{province ? r.chooseDistrict : r.chooseProvince}</h2></div><RegionAtlas locale={locale} provinceCode={province?.code} /></div><div className="region-options-card"><div className="region-card-heading"><span className="region-eyebrow">{province ? 'DISTRICTS' : 'PROVINCES'}</span><h2>{province ? r.chooseDistrict : r.chooseProvince}</h2><p>{options.length} {province ? r.districts : r.regions}</p></div><div className="region-options-list">{options.map(option => <Link key={option.code} href={localized(regionPath(province?.code ?? option.code, province ? option.code : undefined))}><span><strong>{regionName(option, locale)}</strong><small>{option.code}</small></span><span>{option.count.toLocaleString(locale)} <small>{r.toilets}</small></span><b aria-hidden="true">↗</b></Link>)}</div></div></section>}
      <p className="region-source">{r.source}: <a href="https://github.com/DevMinGeonPark/mapcn-kr">SGIS · 행정안전부 / vuski/admdongkor / mapcn-kr</a> (CC BY 4.0). {new Date(regionSnapshot.generatedAt).toLocaleDateString(locale)} · {regionSnapshot.unassigned.toLocaleString(locale)} {locale === 'ko' ? '건은 경계 밖 좌표로 지역 집계에서 제외' : 'coordinates outside boundaries excluded from counts'}.</p>
    </main>
    <footer className="region-footer"><span>© Geupddong</span><Link href={localized('/policies/all')}>{locale === 'ko' ? '이용약관 · 개인정보' : 'Terms & privacy'}</Link></footer>
    {itemList && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList).replace(/</g, '\\u003c') }} />}
  </div>
}
