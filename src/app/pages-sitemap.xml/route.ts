import { sitemapXml } from '../../lib/seo'
import { provinces, allDistricts, regionPath } from '../../lib/regions'
import { SUPPORTED_LOCALES } from '../../i18n/locale'
import { localizedPublicPath } from '../../i18n/routes'
import { xmlResponse } from '../../server/sitemaps'

export function GET() {
  const regionPaths = ['/regions',
    ...provinces.map(province => regionPath(province.code)),
    ...allDistricts().map(district => regionPath(district.provinceCode, district.code))]
  return xmlResponse(sitemapXml(['/', '/policies/terms', '/policies/privacy', '/policies/location',
    ...regionPaths.flatMap(path => SUPPORTED_LOCALES.map(locale => localizedPublicPath(path, locale)!))]))
}
