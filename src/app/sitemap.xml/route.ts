import { getSitemapIds, sitemapUnavailable, xmlResponse } from '../../server/sitemaps'
import { sitemapXml } from '../../lib/seo'
import { connection } from 'next/server'

// Request-time route: do not contact the API during build or enumerate all detail pages.
export async function GET() {
  await connection()
  try {
    const shards = await getSitemapIds()
    return xmlResponse(sitemapXml(['/pages-sitemap.xml', ...shards.map(id => `/sitemap-toilets-${id}.xml`)], true))
  } catch { return sitemapUnavailable() }
}
