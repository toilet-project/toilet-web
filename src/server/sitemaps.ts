import 'server-only'
import { validateSitemapIds } from '../lib/seo'
import type { Locale } from '../i18n/locale'

export type SitemapEntry = { id: number; name: string; latitude: number | null; longitude: number | null }

function sitemapOrigin() { return (process.env.TOILET_API_ORIGIN || 'https://api.geupddong.com').replace(/\/$/, '') }

async function source(endpoint: string) {
  const response = await fetch(`${sitemapOrigin()}/api/v1/toilets/sitemap/${endpoint}`, {
    next: { revalidate: 3600, tags: ['toilet-catalog'] }, signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error('Sitemap source unavailable')
  return response.json() as Promise<unknown>
}

export async function getSitemapIds(shard?: number) {
  const endpoint = shard === undefined ? 'shards' : `ids?shard=${shard}`
  return validateSitemapIds(await source(endpoint), shard)
}

export async function getLocalizedSitemapShards(locale: Locale) {
  return validateSitemapIds(await source(`shards?locale=${locale.toLowerCase()}`))
}

export async function getSitemapEntries(shard: number, locale: Locale): Promise<SitemapEntry[]> {
  const raw = await source(`entries?shard=${shard}&locale=${locale.toLowerCase()}`)
  if (!Array.isArray(raw) || raw.length > 10_000) throw new Error('Invalid sitemap entries')
  validateSitemapIds(raw.map(entry => entry && typeof entry === 'object' ? (entry as SitemapEntry).id : null), shard)
  return raw.map(entry => {
    const item = entry as SitemapEntry
    if (typeof item.name !== 'string' || (locale !== 'ko' && !item.name.trim()) || item.name.length > 255
      || (item.latitude !== null && (typeof item.latitude !== 'number' || !Number.isFinite(item.latitude)))
      || (item.longitude !== null && (typeof item.longitude !== 'number' || !Number.isFinite(item.longitude)))) {
      throw new Error('Invalid sitemap entries')
    }
    return item
  })
}

export function xmlResponse(xml: string) {
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=0, s-maxage=300' } })
}

export function sitemapUnavailable() {
  return new Response('Sitemap temporarily unavailable', { status: 503,
    headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } })
}
