import type { ToiletMapItemResponse } from '../api/toilets.ts'
import { SUPPORTED_LOCALES } from '../i18n/locale.ts'
import { localizedPublicPath } from '../i18n/routes.ts'
import { regionDirectoryEntries } from '../lib/regionDirectory.ts'
import { getDistrict, localizedRegionPath } from '../lib/regions.ts'

/** Compare only the server-rendered directory, not unrelated marker fields. */
export function changedDistrictIndexNowPaths(districtCode: string,
  before: readonly ToiletMapItemResponse[], after: readonly ToiletMapItemResponse[]) {
  if (!/^\d{5}$/.test(districtCode) || !getDistrict(districtCode.slice(0, 2), districtCode))
    throw new Error('Unknown district code')
  return SUPPORTED_LOCALES.flatMap(locale => {
    const previous = regionDirectoryEntries(before, locale, districtCode)
    const current = regionDirectoryEntries(after, locale, districtCode)
    if (JSON.stringify(previous) === JSON.stringify(current)) return []
    return [localizedPublicPath(localizedRegionPath(locale, districtCode.slice(0, 2), districtCode), locale)!]
  })
}
