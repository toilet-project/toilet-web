import sidoSource from '../../data/regions/sido.json' with { type: 'json' }
import districtSource from '../../data/regions/sgg.json' with { type: 'json' }
import countSource from '../../data/regions/counts.json' with { type: 'json' }
import type { Locale } from '../i18n/locale'

export type Position = [number, number]
export type RegionGeometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: Position[][] | Position[][][] }
export type Region = { code: string; name: string; provinceCode: string; provinceName: string; geometry: RegionGeometry; count: number }

const provinceNames: Record<string, { en: string; ja: string; zh: string }> = {
  '11': { en: 'Seoul', ja: 'ソウル', zh: '首尔' }, '26': { en: 'Busan', ja: '釜山', zh: '釜山' },
  '27': { en: 'Daegu', ja: '大邱', zh: '大邱' }, '28': { en: 'Incheon', ja: '仁川', zh: '仁川' },
  '12': { en: 'Jeonnam–Gwangju', ja: '全南・光州', zh: '全南·光州' }, '30': { en: 'Daejeon', ja: '大田', zh: '大田' },
  '31': { en: 'Ulsan', ja: '蔚山', zh: '蔚山' }, '36': { en: 'Sejong', ja: '世宗', zh: '世宗' },
  '41': { en: 'Gyeonggi', ja: '京畿道', zh: '京畿道' }, '51': { en: 'Gangwon', ja: '江原道', zh: '江原道' },
  '43': { en: 'Chungbuk', ja: '忠清北道', zh: '忠清北道' }, '44': { en: 'Chungnam', ja: '忠清南道', zh: '忠清南道' },
  '47': { en: 'Gyeongbuk', ja: '慶尚北道', zh: '庆尚北道' }, '48': { en: 'Gyeongnam', ja: '慶尚南道', zh: '庆尚南道' },
  '50': { en: 'Jeju', ja: '済州', zh: '济州' }, '52': { en: 'Jeonbuk', ja: '全北', zh: '全北' },
}

const districts: Region[] = districtSource.features.map(feature => ({
  code: feature.properties.sgg,
  name: feature.properties.sggnm.replace(/^(.+?시)(.+구)$/u, '$1 $2'),
  provinceCode: feature.properties.sido,
  provinceName: feature.properties.sidonm,
  geometry: feature.geometry as RegionGeometry,
  count: countSource.counts[feature.properties.sgg as keyof typeof countSource.counts] ?? 0,
}))

export const provinces: Region[] = sidoSource.features.map(feature => ({
  code: feature.properties.sido,
  name: feature.properties.sidonm,
  provinceCode: feature.properties.sido,
  provinceName: feature.properties.sidonm,
  geometry: feature.geometry as RegionGeometry,
  count: districts.filter(district => district.provinceCode === feature.properties.sido).reduce((sum, district) => sum + district.count, 0),
}))

export function getProvince(code: string) { return provinces.find(province => province.code === code) ?? null }
export function getDistrict(provinceCode: string, districtCode: string) {
  return districts.find(district => district.provinceCode === provinceCode && district.code === districtCode) ?? null
}
export function districtsIn(provinceCode: string) { return districts.filter(district => district.provinceCode === provinceCode) }
export function allDistricts() { return districts }
export function regionName(region: Region, locale: Locale) {
  if (locale === 'ko') return region.name
  if (region.code.length === 2) {
    const localized = provinceNames[region.code]
    return locale === 'en' ? localized?.en ?? region.name : locale === 'ja' ? localized?.ja ?? region.name : localized?.zh ?? region.name
  }
  // Administrative proper names stay in their authoritative form until reviewed translations exist.
  return region.name
}

export function polygonParts(geometry: RegionGeometry): Position[][][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates as Position[][]] : geometry.coordinates as Position[][][]
}

export function regionBounds(region: Region): { west: number; south: number; east: number; north: number } {
  const points = polygonParts(region.geometry).flat(2)
  return { west: Math.min(...points.map(point => point[0])), south: Math.min(...points.map(point => point[1])),
    east: Math.max(...points.map(point => point[0])), north: Math.max(...points.map(point => point[1])) }
}

function ringContains(ring: Position[], x: number, y: number) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function regionContains(region: Region, longitude: number, latitude: number) {
  const { west, south, east, north } = regionBounds(region)
  if (longitude < west || longitude > east || latitude < south || latitude > north) return false
  return polygonParts(region.geometry).some(rings => ringContains(rings[0], longitude, latitude) && !rings.slice(1).some(ring => ringContains(ring, longitude, latitude)))
}

export function districtAt(longitude: number, latitude: number) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  return districts.find(district => regionContains(district, longitude, latitude)) ?? null
}

export function regionPath(provinceCode?: string, districtCode?: string) {
  if (!provinceCode) return '/regions'
  if (!getProvince(provinceCode)) return '/regions'
  if (!districtCode) return `/regions/${provinceCode}`
  return getDistrict(provinceCode, districtCode) ? `/regions/${provinceCode}/${districtCode}` : `/regions/${provinceCode}`
}

export const regionSnapshot = { generatedAt: countSource.generatedAt, sourceCount: countSource.sourceCount, unassigned: countSource.unassigned }
