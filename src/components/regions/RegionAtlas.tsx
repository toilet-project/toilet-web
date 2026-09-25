import { districtsIn, getProvince, polygonParts, provinces, regionBounds, regionName, localizedRegionPath } from '../../lib/regions'
import { atlasProjection } from '../../lib/regionAtlasGeometry'
import atlasAssets from '../../../data/regions/atlas-assets.json' with { type: 'json' }
import { localizedPublicPath } from '../../i18n/routes'
import type { Locale } from '../../i18n/locale'
import { regionText } from './regionText'
import { RegionAtlasCanvas } from './RegionAtlasCanvas'
import { provinceMapNames, regionColors, regionLabelAnchor, regionLabelOptions } from '../../lib/regionAtlasLabels'

export function RegionAtlas({ locale, provinceCode }: { locale: Locale; provinceCode?: string }) {
  const t = regionText(locale)
  const province = provinceCode ? getProvince(provinceCode) : null
  const regions = province ? districtsIn(province.code) : provinces
  const colors = regionColors(regions)
  const { width, height, project } = atlasProjection(regions, Boolean(province))
  const assetHref = province ? atlasAssets.provinces[province.code as keyof typeof atlasAssets.provinces] : atlasAssets.national

  return <><link rel="preload" as="image" href={assetHref} type="image/svg+xml" />
    <RegionAtlasCanvas key={province?.code ?? 'all'} width={width} height={height} assetHref={assetHref} label={province ? t.chooseDistrict : t.chooseProvince} countLabel={t.toilets}
    zoomInLabel={t.zoomIn} zoomOutLabel={t.zoomOut} resetLabel={t.resetView} detailHint={t.zoomDetails}
    overview={!province}
    areas={regions.map((region, index) => {
      const bounds = regionBounds(region)
      const surface = polygonParts(region.geometry).reduce((sum, rings) => sum + rings.reduce((part, ring, ringIndex) => part + (ringIndex ? -1 : 1) * Math.abs(ring.reduce((area, point, i) => {
        const p = project(point), next = project(ring[(i + 1) % ring.length])
        return area + p[0] * next[1] - next[0] * p[1]
      }, 0)) / 2, 0), 0)
      const emphasized = !province && region.code === '11'
      const anchor = regionLabelAnchor(region)
      return { code: region.code, name: regionName(region, locale), mapName: !province && locale === 'ko' ? provinceMapNames[region.code] ?? region.name : regionName(region, locale), emphasized,
        count: region.count.toLocaleString(locale), anchor: project(anchor), alternatives: !province && !emphasized ? regionLabelOptions(region, anchor).map(project) : [], color: emphasized ? '#317756' : colors[index],
        surface, regionWidth: project([bounds.east, bounds.north])[0] - project([bounds.west, bounds.north])[0],
        href: localizedPublicPath(localizedRegionPath(locale, province?.code ?? region.code, province ? region.code : undefined), locale)! }
    })} /></>
}
