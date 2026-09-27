'use client'

import Link from 'next/link'
import { useEffect, type ReactNode, type MouseEvent } from 'react'
import { usePathname } from 'next/navigation'
import type { Locale } from '../../i18n/locale'
import { SUPPORTED_LOCALES } from '../../i18n/locale'
import { useLocale } from '../../i18n/context'
import { localizedPublicPath } from '../../i18n/routes'
import { regionSeoCopy } from '../../i18n/regionSeoCopy'
import { safeJsonLd, SITE_ORIGIN } from '../../lib/seo'
import { districtsIn, localizedRegionPath, provinces, regionName, regionSnapshot } from '../../lib/regions'
import { regionNavigationTarget } from '../../lib/regionNavigation'
import { preloadRegion } from '../../lib/regionNavigationClient'
import outlineAssets from '../../../data/regions/outline-assets.json' with { type: 'json' }
import { RegionPicker } from './RegionPicker'
import { RegionAtlas } from './RegionAtlas'
import { DistrictMapData } from './DistrictMapData'
import { regionText } from './regionText'

export function RegionExplorer({ initialLocale, initialHref, initialDistrictCode, directory }: {
  initialLocale: Locale; initialHref: string; initialDistrictCode?: string; directory?: ReactNode
}) {
  const locale = useLocale(), pathname = usePathname()
  const target = regionNavigationTarget(pathname ?? initialHref) ?? regionNavigationTarget(initialHref)!
  const { province, district } = target
  const path = localizedRegionPath(locale, province?.code, district?.code)
  useEffect(() => { preloadRegion(target.href) }, [target.href])
  function navigate(event: MouseEvent<HTMLElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!anchor || anchor.getAttribute('target') && anchor.getAttribute('target') !== '_self' || anchor.hasAttribute('download')) return
    const next = regionNavigationTarget(anchor.getAttribute('href') ?? '')
    if (!next || next.locale !== locale) return
    event.preventDefault(); event.stopPropagation()
    preloadRegion(next.href)
    if (next.href !== target.href) window.history.pushState(null, '', next.href)
  }
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
  useEffect(() => {
    // Native history keeps navigation instant. Direct requests still receive
    // these same canonical/locale metadata from generateMetadata on the server.
    const browserTitle = `${title} | ${locale === 'ko' ? '급똥' : 'Geupddong'}`
    document.querySelector('title')?.replaceChildren(document.createTextNode(browserTitle))
    document.querySelector('meta[name="description"]')?.setAttribute('content', description)
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', pageUrl)
    for (const language of SUPPORTED_LOCALES) {
      const href = SITE_ORIGIN + localizedPublicPath(localizedRegionPath(language, province?.code, district?.code), language)
      document.querySelector(`link[hreflang="${language}"]`)?.setAttribute('href', encodeURI(href))
    }
    for (const [key, value] of [['og:title', browserTitle], ['og:description', description], ['og:url', pageUrl]])
      document.querySelector(`meta[property="${key}"]`)?.setAttribute('content', value)
  }, [title, description, pageUrl, locale, province?.code, district?.code])
  const sourceNote = <details className="region-source"><summary>{r.source}<span aria-hidden="true">ⓘ</span></summary><p><a href="https://github.com/DevMinGeonPark/mapcn-kr">SGIS · 행정안전부 / vuski/admdongkor / mapcn-kr</a> (CC BY 4.0).<br />{new Date(regionSnapshot.generatedAt).toLocaleDateString(locale)} · {regionSnapshot.unassigned.toLocaleString(locale)} {r.outsideBoundary}.</p></details>
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(structured) }} />
    <main onClickCapture={navigate} className={`region-main${!province ? ' is-national' : ''}`}>
      <nav className="region-breadcrumbs" aria-label="Breadcrumb">{breadcrumbs.map((item, index) => <span key={item.path}>{index > 0 && <span aria-hidden="true"> / </span>}{index === breadcrumbs.length - 1 ? <span aria-current="page">{item.name}</span> : <Link href={item.path}>{item.name}</Link>}</span>)}</nav>
      <div className="region-hero">
        <div className="region-hero-copy"><span className="region-eyebrow">{r.explore}</span>
          <div className="region-hero-heading"><h1>{title}</h1><span className="region-hero-count">{r.totalCount.replace('{count}', count)}</span></div>
          <p>{r.intro}</p>
        </div>
        {!district && <RegionPicker key={province?.code ?? "national"} title={r.allRegions} label={province ? r.chooseDistrict : r.chooseProvince} countLabel={r.toilets} closeLabel={r.closeSelection}
          areas={regions.map(region => ({ code: region.code, name: regionName(region, locale), count: region.count.toLocaleString(locale), href: localized(localizedRegionPath(locale, province?.code ?? region.code, province ? region.code : undefined)),
            outlineHref: province ? outlineAssets[region.code as keyof typeof outlineAssets] : undefined }))} />}
        <p className="region-mobile-hint">{district ? r.mobileMarkerHint : r.mobileExploreHint}</p>
      </div>
      {district && province ? <section className="region-district-layout" aria-label={title}>
        <div className="region-district-map-card"><div className="region-card-heading"><span className="region-eyebrow">{r.locationMap}</span><h2>{areaName}</h2></div>
          <DistrictMapData key={`${locale}:${district.code}`} district={district} locale={locale}
            directory={initialLocale === locale && initialDistrictCode === district.code ? directory : undefined} />
          {sourceNote}</div>
      </section> : <section className="region-discovery-layout"><div className="region-atlas-card"><RegionAtlas locale={locale} provinceCode={province?.code} />{sourceNote}</div></section>}
    </main></>
}
