import type { ToiletMapItemResponse } from '../api/toilets.ts'
import type { Locale } from '../i18n/locale.ts'
import { localizedPublicPath } from '../i18n/routes.ts'
import { localizeToiletMapItem } from '../i18n/toiletTranslations.ts'
import { regionToiletPathForDistrict } from './regionToiletPath.ts'

/** The exact facility names and links rendered in a district's public directory. */
export function regionDirectoryEntries(toilets: readonly ToiletMapItemResponse[], locale: Locale, districtCode: string) {
  return toilets.map(toilet => ({
    id: toilet.id,
    name: localizeToiletMapItem(toilet, locale).name,
    href: localizedPublicPath(regionToiletPathForDistrict(toilet, locale, districtCode), locale)!,
  })).sort((left, right) => left.name.localeCompare(right.name, locale) || left.id - right.id)
}
