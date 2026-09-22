import { MAX_SHARD, sitemapXml } from '../../../lib/seo'
import { facilitySlug } from '../../../lib/regionToiletPath'
import { localizedRegionPath } from '../../../lib/regions'
import toiletRegions from '../../../../data/regions/toilet-district.json'
import { getSitemapIds, sitemapUnavailable, xmlResponse } from '../../../server/sitemaps'

const regions: Record<string, string[]> = toiletRegions

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params
  if (!/^(0|[1-9]\d*)\.xml$/.test(file)) return new Response(null, { status: 404 })
  const shard = Number(file.slice(0, -4))
  if (!Number.isSafeInteger(shard) || shard > MAX_SHARD) return new Response(null, { status: 404 })
  try {
    const ids = await getSitemapIds(shard)
    if (!ids.length) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    return xmlResponse(sitemapXml(ids.map(id => {
      const region = regions[id]
      return region?.length === 2 ? `${localizedRegionPath('ko', region[0].slice(0, 2), region[0])}/toilet/${id}-${facilitySlug(region[1])}` : `/toilet/${id}`
    })))
  } catch { return sitemapUnavailable() }
}
