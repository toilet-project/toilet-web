import { districtsIn, getProvince, provinces, regionName, localizedRegionPath } from '../../lib/regions'
import layouts from '../../../data/regions/atlas-layouts.json' with { type: 'json' }
import atlasAssets from '../../../data/regions/atlas-assets.json' with { type: 'json' }
import outlineAssets from '../../../data/regions/outline-assets.json' with { type: 'json' }
import { localizedPublicPath } from '../../i18n/routes'
import type { Locale } from '../../i18n/locale'
import { regionText } from './regionText'
import { RegionAtlasCanvas } from './RegionAtlasCanvas'
import { provinceMapNames } from '../../lib/regionAtlasLabels'

export function RegionAtlas({ locale, provinceCode }: { locale: Locale; provinceCode?: string }) {
  const t = regionText(locale)
  const province = provinceCode ? getProvince(provinceCode) : null
  const regions = province ? districtsIn(province.code) : provinces
  const layout = layouts[(province?.code ?? 'national') as keyof typeof layouts]
  const { width, height } = layout
  const assetHref = province ? atlasAssets.provinces[province.code as keyof typeof atlasAssets.provinces] : atlasAssets.national

  return <><link rel="preload" as="image" href={assetHref} type="image/svg+xml" />
    <RegionAtlasCanvas key={province?.code ?? 'all'} width={width} height={height} assetHref={assetHref} label={province ? t.chooseDistrict : t.chooseProvince} countLabel={t.toilets}
    zoomInLabel={t.zoomIn} zoomOutLabel={t.zoomOut} resetLabel={t.resetView} detailHint={t.zoomDetails}
    overview={!province}
    areas={regions.map((region, index) => {
      const geometry = layout.areas[index]
      const emphasized = !province && region.code === '11'
      return { code: region.code, name: regionName(region, locale), mapName: !province && locale === 'ko' ? provinceMapNames[region.code] ?? region.name : regionName(region, locale), emphasized,
        count: region.count.toLocaleString(locale), anchor: geometry.anchor as [number, number], alternatives: geometry.alternatives as [number, number][],
        color: geometry.color, surface: geometry.surface, regionWidth: geometry.regionWidth,
        href: localizedPublicPath(localizedRegionPath(locale, province?.code ?? region.code, province ? region.code : undefined), locale)!,
        outlineHref: province ? outlineAssets[region.code as keyof typeof outlineAssets] : undefined }
    })} /></>
}
