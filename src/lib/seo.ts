import type { ToiletDetailResponse } from '../api/toilets.ts'
import { getDisplayAddress } from './address.ts'
import { toiletCoordinates, toiletPath } from './toiletRoute.ts'

export const SITE_ORIGIN = 'https://geupddong.com'
export const SITEMAP_SIZE = 10_000
export const MAX_SHARD = Math.floor((Number.MAX_SAFE_INTEGER - 1) / SITEMAP_SIZE)

export function placeData(detail: ToiletDetailResponse) {
  const address = getDisplayAddress(detail.roadAddress, detail.jibunAddress)
  const coords = toiletCoordinates(detail)
  const region = detail.region
  return {
    '@context': 'https://schema.org', '@type': 'Place',
    '@id': `${SITE_ORIGIN}${toiletPath(detail.id)}#place`,
    url: `${SITE_ORIGIN}${toiletPath(detail.id)}`, name: detail.name,
    ...(address ? { address: { '@type': 'PostalAddress', streetAddress: address, addressCountry: 'KR',
      ...(region?.sidoName ? { addressRegion: region.sidoName } : {}),
      ...(region?.sigunguName ? { addressLocality: region.sigunguName } : {}),
    } } : {}),
    ...(coords ? { geo: { '@type': 'GeoCoordinates', ...coords } } : {}),
  }
}

export function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

export function sitemapXml(paths: string[], index = false) {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
  const root = index ? 'sitemapindex' : 'urlset'
  const item = index ? 'sitemap' : 'url'
  return `<?xml version="1.0" encoding="UTF-8"?><${root} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<${item}><loc>${escape(SITE_ORIGIN + path)}</loc></${item}>`).join('')}</${root}>`
}

export function validateSitemapIds(value: unknown, shard?: number): number[] {
  const max = shard === undefined ? 49_999 : SITEMAP_SIZE
  if (!Array.isArray(value) || value.length > max) throw new Error('Invalid sitemap response')
  let previous = -1
  for (const id of value) {
    if (!Number.isSafeInteger(id) || id <= previous || (shard === undefined
      ? id < 0 || id > MAX_SHARD
      : id <= shard * SITEMAP_SIZE || id > Math.min((shard + 1) * SITEMAP_SIZE, Number.MAX_SAFE_INTEGER))) {
      throw new Error('Invalid sitemap response')
    }
    previous = id
  }
  return value
}

export function robotsPolicy(indexable: boolean) {
  return indexable
    ? { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/_internal/', '/admin/', '/login/'] }, sitemap: `${SITE_ORIGIN}/sitemap.xml` }
    : { rules: { userAgent: '*', disallow: '/' } }
}
