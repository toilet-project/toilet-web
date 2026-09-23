import type { ToiletDetailResponse } from '../api/toilets'
import type { Locale } from '../i18n/locale'
import { localizeToilet } from '../i18n/toiletTranslations.ts'
import { districtForToilet, getDistrict, localizedRegionPath } from './regions.ts'
import { toiletPath } from './toiletRoute.ts'
import { urlName } from './urlName.ts'

export const facilitySlug = urlName

type RoutableToilet = Pick<ToiletDetailResponse, 'id' | 'name' | 'latitude' | 'longitude' | 'translations'>

/** Build a canonical path from the release snapshot without repeating polygon scans. */
export function regionToiletPathForDistrict(detail: Pick<RoutableToilet, 'id' | 'name' | 'translations'>,
  locale: Locale, districtCode: string | null | undefined) {
  if (!districtCode || !/^\d{5}$/.test(districtCode)
    || !getDistrict(districtCode.slice(0, 2), districtCode)) return toiletPath(detail.id)
  const name = localizeToilet(detail, locale).name
  return `${localizedRegionPath(locale, districtCode.slice(0, 2), districtCode)}/toilet/${detail.id}-${facilitySlug(name)}`
}

export function regionToiletPath(detail: RoutableToilet, locale: Locale = 'ko') {
  if (detail.latitude == null || detail.longitude == null) return toiletPath(detail.id)
  const district = districtForToilet(detail.id, detail.longitude, detail.latitude)
  return regionToiletPathForDistrict(detail, locale, district?.code)
}

export function parseRegionToiletSegment(segment: string) {
  const match = /^([1-9]\d*)-([\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*)$/u.exec(segment)
  if (!match) return null
  const id = Number(match[1])
  return Number.isSafeInteger(id) ? id : null
}
