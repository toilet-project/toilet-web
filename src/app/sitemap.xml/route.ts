import { getLocalizedSitemapShards, getSitemapIds, sitemapUnavailable, xmlResponse } from '../../server/sitemaps'
import { sitemapXml } from '../../lib/seo'
import { connection } from 'next/server'
import { SUPPORTED_LOCALES } from '../../i18n/locale'

// Request-time route: do not contact the API during build or enumerate all detail pages.
export async function GET() {
  await connection()
  try {
    const foreignLocales = SUPPORTED_LOCALES.filter(locale => locale !== 'ko')
    const [korean, ...localized] = await Promise.all([getSitemapIds(),
      ...foreignLocales.map(locale => getLocalizedSitemapShards(locale))])
    const paths = ['/pages-sitemap.xml', ...korean.map(id => `/sitemap-toilets-${id}.xml`),
      ...foreignLocales.flatMap((locale, index) => localized[index].map(id =>
        `/sitemap-toilets-${id}-${locale.toLowerCase()}.xml`))]
    if (paths.length > 50_000) throw new Error('Sitemap index capacity exceeded')
    return xmlResponse(sitemapXml(paths, true))
  } catch { return sitemapUnavailable() }
}
