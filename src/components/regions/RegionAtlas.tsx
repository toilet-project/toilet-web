import { districtsIn, getProvince, polygonParts, provinces, regionBounds, regionName, regionPath, type Region } from '../../lib/regions'
import { localizedPublicPath } from '../../i18n/routes'
import type { Locale } from '../../i18n/locale'
import { regionText } from './regionText'
import { RegionAtlasCanvas } from './RegionAtlasCanvas'

function pathFor(region: Region, project: (point: [number, number]) => [number, number]) {
  return polygonParts(region.geometry).map(rings => rings.map(ring => ring.map((point, index) => {
    const [x, y] = project(point)
    return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ') + 'Z').join(' ')).join(' ')
}

function extent(regions: Region[]) {
  const bounds = regions.map(regionBounds)
  return { west: Math.min(...bounds.map(b => b.west)), south: Math.min(...bounds.map(b => b.south)),
    east: Math.max(...bounds.map(b => b.east)), north: Math.max(...bounds.map(b => b.north)) }
}

export function RegionAtlas({ locale, provinceCode }: { locale: Locale; provinceCode?: string }) {
  const t = regionText(locale)
  const province = provinceCode ? getProvince(provinceCode) : null
  const regions = province ? districtsIn(province.code) : provinces
  const boundary = extent(regions)
  const width = 760, height = province ? 560 : 800, pad = 32
  const xSpan = (boundary.east - boundary.west) * Math.cos(37 * Math.PI / 180)
  const ySpan = boundary.north - boundary.south
  const scale = Math.min((width - 2 * pad) / xSpan, (height - 2 * pad) / ySpan)
  const drawnWidth = xSpan * scale, drawnHeight = ySpan * scale
  const xOffset = (width - drawnWidth) / 2, yOffset = (height - drawnHeight) / 2
  const project = ([longitude, latitude]: [number, number]): [number, number] => [
    xOffset + (longitude - boundary.west) * Math.cos(37 * Math.PI / 180) * scale,
    yOffset + (boundary.north - latitude) * scale,
  ]

  return <RegionAtlasCanvas key={province?.code ?? 'all'} width={width} height={height} label={province ? t.chooseDistrict : t.chooseProvince} countLabel={t.toilets} enterLabel={t.open}
    zoomInLabel={t.zoomIn} zoomOutLabel={t.zoomOut} resetLabel={t.resetView}
    areas={regions.map(region => ({ code: region.code, name: regionName(region, locale), count: region.count.toLocaleString(locale),
      href: localizedPublicPath(regionPath(province?.code ?? region.code, province ? region.code : undefined), locale)!, path: pathFor(region, project) }))} />
}
