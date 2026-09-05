import { MAX_SHARD, sitemapXml } from '../../../lib/seo'
import { getSitemapIds, sitemapUnavailable, xmlResponse } from '../../../server/sitemaps'

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params
  if (!/^(0|[1-9]\d*)\.xml$/.test(file)) return new Response(null, { status: 404 })
  const shard = Number(file.slice(0, -4))
  if (!Number.isSafeInteger(shard) || shard > MAX_SHARD) return new Response(null, { status: 404 })
  try {
    const ids = await getSitemapIds(shard)
    if (!ids.length) return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    return xmlResponse(sitemapXml(ids.map(id => `/toilet/${id}`)))
  } catch { return sitemapUnavailable() }
}
