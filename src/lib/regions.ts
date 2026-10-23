import sidoSource from '../../data/regions/sido.json' with { type: 'json' }
import districtSource from '../../data/regions/sgg.json' with { type: 'json' }
import countSource from '../../data/regions/counts.json' with { type: 'json' }
import districtNames from '../../data/regions/names.json' with { type: 'json' }
import boundaryOverrides from '../../data/regions/toilet-boundary-overrides.json' with { type: 'json' }
import type { Locale } from '../i18n/locale'
import { urlName } from './urlName.ts'
import { regionContains, type RegionGeometry } from './regionGeometry.ts'

export { polygonParts, regionBounds, regionContains } from './regionGeometry.ts'
export type { Position, RegionGeometry } from './regionGeometry.ts'
export { isSouthKoreanCoordinate } from './koreaBoundary.ts'
export type Region = { code: string; name: string; provinceCode: string; provinceName: string; geometry: RegionGeometry; count: number }

const provinceNames: Record<string, { en: string; ja: string; zh: string; zhTraditional?: string }> = {
  '11': { en: 'Seoul', ja: 'ソウル', zh: '首尔', zhTraditional: '首爾' }, '26': { en: 'Busan', ja: '釜山', zh: '釜山' },
  '27': { en: 'Daegu', ja: '大邱', zh: '大邱' }, '28': { en: 'Incheon', ja: '仁川', zh: '仁川' },
  '12': { en: 'Jeonnam–Gwangju', ja: '全南・光州', zh: '全南·光州' }, '30': { en: 'Daejeon', ja: '大田', zh: '大田' },
  '31': { en: 'Ulsan', ja: '蔚山', zh: '蔚山' }, '36': { en: 'Sejong', ja: '世宗', zh: '世宗' },
  '41': { en: 'Gyeonggi', ja: '京畿道', zh: '京畿道' }, '51': { en: 'Gangwon', ja: '江原道', zh: '江原道' },
  '43': { en: 'Chungbuk', ja: '忠清北道', zh: '忠清北道' }, '44': { en: 'Chungnam', ja: '忠清南道', zh: '忠清南道' },
  '47': { en: 'Gyeongbuk', ja: '慶尚北道', zh: '庆尚北道', zhTraditional: '慶尚北道' }, '48': { en: 'Gyeongnam', ja: '慶尚南道', zh: '庆尚南道', zhTraditional: '慶尚南道' },
  '50': { en: 'Jeju', ja: '済州', zh: '济州', zhTraditional: '濟州' }, '52': { en: 'Jeonbuk', ja: '全北', zh: '全北' },
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
    if (locale === 'en') return localized?.en ?? region.name
    if (locale === 'ja') return localized?.ja ?? region.name
    if (locale === 'zh-TW' || locale === 'zh-HK') return localized?.zhTraditional ?? localized?.zh ?? region.name
    return localized?.zh ?? region.name
  }
  // The five-digit code links geometry, canonical Korean names and locale labels.
  // A newly added code remains usable in Korean until its translation is exported.
  return (districtNames as Record<string, Partial<Record<Locale, string>>>)[region.code]?.[locale] ?? region.name
}

export function districtAt(longitude: number, latitude: number) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  return districts.find(district => regionContains(district, longitude, latitude)) ?? null
}

/** Snapshot corrections keep client-side detail links aligned with the precise district assignment. */
export function districtForToilet(id: number, longitude: number, latitude: number) {
  const overrides = boundaryOverrides as Record<string, Array<string | number | null>>
  const correction = overrides[String(id)]
  // A facility can move after the snapshot; never apply its old correction
  // to new coordinates.
  if (correction && correction.length === 3 && typeof correction[1] === 'number' && typeof correction[2] === 'number'
    && Math.abs(latitude - correction[1]) < 0.0000001 && Math.abs(longitude - correction[2]) < 0.0000001) {
    const code = correction[0]
    return typeof code === 'string' ? getDistrict(code.slice(0, 2), code) : null
  }
  return districtAt(longitude, latitude)
}

export function regionPath(provinceCode?: string, districtCode?: string) {
  if (!provinceCode) return '/regions'
  if (!getProvince(provinceCode)) return '/regions'
  if (!districtCode) return `/regions/${provinceCode}`
  return getDistrict(provinceCode, districtCode) ? `/regions/${provinceCode}/${districtCode}` : `/regions/${provinceCode}`
}

export function localizedRegionPath(locale: Locale, provinceCode?: string, districtCode?: string) {
  if (!provinceCode) return '/regions'
  const province = getProvince(provinceCode)
  if (!province) return '/regions'
  const provincePath = `/regions/${urlName(regionName(province, locale))}-${province.code}`
  if (!districtCode) return provincePath
  const district = getDistrict(province.code, districtCode)
  return district ? `${provincePath}/${urlName(regionName(district, locale))}-${district.code}` : provincePath
}

export const regionSnapshot = { generatedAt: countSource.generatedAt, sourceCount: countSource.sourceCount, unassigned: countSource.unassigned }
