import { getDistrict } from '../../../../../lib/regions'
import { publicRegionItems } from '../../../../../lib/regionDisplayItems'
import { isLocale } from '../../../../../i18n/locale'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params, locale = new URL(request.url).searchParams.get('locale') ?? 'ko'
  if (!/^\d{5}$/.test(code) || !getDistrict(code.slice(0, 2), code) || !isLocale(locale))
    return Response.json({ error: 'Unknown district or locale' }, { status: 400, headers })
  try {
    const { getDistrictToiletsWithSource } = await import('../../../../../server/regions')
    const result = await getDistrictToiletsWithSource(code.slice(0, 2), code)
    return Response.json({ toilets: publicRegionItems(result.toilets, locale) }, {
      headers: { ...headers, 'X-Region-Marker-Cache': result.source, 'X-Region-Marker-Path': 'loader' },
    })
  } catch { return Response.json({ error: 'District unavailable' }, { status: 503, headers }) }
}
