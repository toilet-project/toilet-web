import type { Locale } from '../i18n/locale'
import { parseLocalizedPublicPath, localizedPublicPath } from '../i18n/routes.ts'
import { codeFromRegionSegment } from './urlName.ts'
import { getDistrict, getProvince, localizedRegionPath } from './regions.ts'

/** Only same-site atlas routes participate in instant navigation. Facility links do not. */
export function regionNavigationTarget(href: string) {
  const parsed = parseLocalizedPublicPath(href)
  if (!parsed || parsed.suffix || !/^\/regions(?:\/|$)/.test(parsed.path)) return null
  const parts = parsed.path.split('/').slice(2)
  if (parts.length > 2) return null
  const province = parts[0] ? getProvince(codeFromRegionSegment(parts[0], 2) ?? '') : null
  const district = parts[1] && province ? getDistrict(province.code, codeFromRegionSegment(parts[1], 5) ?? '') : null
  if (parts[0] && !province || parts[1] && !district) return null
  return { province, district, locale: parsed.locale as Locale,
    href: localizedPublicPath(localizedRegionPath(parsed.locale, province?.code, district?.code), parsed.locale)! }
}
