import { sitemapXml } from '../../lib/seo'
import { provinces, allDistricts, localizedRegionPath } from '../../lib/regions'
import { SUPPORTED_LOCALES } from '../../i18n/locale'
import { localizedPublicPath } from '../../i18n/routes'
import { xmlResponse } from '../../server/sitemaps'

export function GET() {
  const regionPaths = (locale: typeof SUPPORTED_LOCALES[number]) => ['/regions',
    ...provinces.map(province => localizedRegionPath(locale, province.code)),
    ...allDistricts().map(district => localizedRegionPath(locale, district.provinceCode, district.code))]
  return xmlResponse(sitemapXml(['/', '/policies/terms', '/policies/privacy', '/policies/location',
    ...SUPPORTED_LOCALES.flatMap(locale => regionPaths(locale).map(path => localizedPublicPath(path, locale)!))]))
}
