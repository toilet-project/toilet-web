import 'server-only'
import { validateSitemapIds } from '../lib/seo'

export async function getSitemapIds(shard?: number) {
  const origin = process.env.TOILET_API_ORIGIN || 'https://api.geupddong.com'
  const endpoint = shard === undefined ? 'shards' : `ids?shard=${shard}`
  const response = await fetch(`${origin.replace(/\/$/, '')}/api/v1/toilets/sitemap/${endpoint}`, {
    next: { revalidate: 3600 }, signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('Sitemap source unavailable')
  return validateSitemapIds(await response.json(), shard)
}

export function xmlResponse(xml: string) {
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=0, s-maxage=300' } })
}

export function sitemapUnavailable() {
  return new Response('Sitemap temporarily unavailable', { status: 503,
    headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } })
}
