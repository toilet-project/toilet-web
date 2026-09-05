import { sitemapXml } from '../../lib/seo'
import { xmlResponse } from '../../server/sitemaps'

export function GET() {
  return xmlResponse(sitemapXml(['/', '/policies/terms', '/policies/privacy', '/policies/location']))
}
