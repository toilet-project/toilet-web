import type { ToiletDetailResponse } from '../api/toilets'
import type { Locale } from '../i18n/locale'
import { localizeToilet } from '../i18n/toiletTranslations.ts'
import { districtForToilet, localizedRegionPath } from './regions.ts'
import { toiletPath } from './toiletRoute.ts'
import { urlName } from './urlName.ts'

export const facilitySlug = urlName

type RoutableToilet = Pick<ToiletDetailResponse, 'id' | 'name' | 'latitude' | 'longitude' | 'translations'>

export function regionToiletPath(detail: RoutableToilet, locale: Locale = 'ko') {
  if (detail.latitude == null || detail.longitude == null) return toiletPath(detail.id)
  const district = districtForToilet(detail.id, detail.longitude, detail.latitude)
  if (!district) return toiletPath(detail.id)
  const name = localizeToilet(detail, locale).name
  return `${localizedRegionPath(locale, district.provinceCode, district.code)}/toilet/${detail.id}-${facilitySlug(name)}`
}

export function parseRegionToiletSegment(segment: string) {
  const match = /^([1-9]\d*)-([\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*)$/u.exec(segment)
  if (!match) return null
  const id = Number(match[1])
  return Number.isSafeInteger(id) ? id : null
}
