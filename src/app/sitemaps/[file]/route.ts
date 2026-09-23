import { MAX_SHARD, sitemapXml } from '../../../lib/seo'
import { regionToiletPath, regionToiletPathForDistrict } from '../../../lib/regionToiletPath'
import { localizedPublicPath } from '../../../i18n/routes'
import { SUPPORTED_LOCALES } from '../../../i18n/locale'
import { ENGLISH_UI_ENABLED } from '../../../i18n/feature'
import { getSitemapEntries, sitemapUnavailable, xmlResponse } from '../../../server/sitemaps'
import toiletDistrictCodes from '../../../../data/regions/toilet-district-codes.json' with { type: 'json' }

const districtCodes = toiletDistrictCodes as Array<string | null>

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params
  const match = /^(0|[1-9]\d*)(?:-(en|ja|zh-cn|zh-tw|zh-hk))?\.xml$/.exec(file)
  if (!match) return new Response(null, { status: 404 })
  const shard = Number(match[1])
  if (!Number.isSafeInteger(shard) || shard > MAX_SHARD) return new Response(null, { status: 404 })
  const locale = SUPPORTED_LOCALES.find(item => item.toLowerCase() === match[2]) ?? 'ko'
  if (locale !== 'ko' && !ENGLISH_UI_ENABLED) return new Response(null, { status: 404 })
  try {
    const entries = await getSitemapEntries(shard, locale)
    if (!entries.length) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    return xmlResponse(sitemapXml(entries.map(entry => {
      const districtCode = districtCodes[entry.id]
      const path = districtCode ? regionToiletPathForDistrict(entry, locale, districtCode) : regionToiletPath(entry, locale)
      return localizedPublicPath(path, locale)!
    })))
  } catch { return sitemapUnavailable() }
}
