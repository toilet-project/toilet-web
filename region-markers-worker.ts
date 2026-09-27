import boundaries from './data/regions/boundary-assets.json' with { type: 'json' }
import { readFreshRegionMarkers } from './src/lib/regionMarkerStore.ts'
import { publicRegionItems } from './src/lib/regionDisplayItems.ts'
import type { Locale } from './src/i18n/locale'
import type { R2BucketLike } from './src/server/sharedToiletCache'

export async function regionMarkersResponse(request: Request, env: { REGION_MARKER_CACHE_ENABLED?: string; PUBLIC_TOILET_DATA_CACHE_R2?: R2BucketLike }) {
  const url = new URL(request.url), match = /^\/api\/public\/region-markers\/(\d{5})$/.exec(url.pathname)
  if (!match || request.method !== 'GET') return null
  const code = match[1], locale = url.searchParams.get('locale') ?? 'ko'
  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex', 'X-Content-Type-Options': 'nosniff' }
  if (!(code in boundaries) || !['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK'].includes(locale))
    return Response.json({ error: 'Unknown district or locale' }, { status: 400, headers })
  if (env.REGION_MARKER_CACHE_ENABLED !== 'true' || !env.PUBLIC_TOILET_DATA_CACHE_R2) return null
  try {
    const toilets = await readFreshRegionMarkers(env.PUBLIC_TOILET_DATA_CACHE_R2, code)
    if (!toilets) return null // Existing Next loader owns cache misses and origin leases.
    return Response.json({ toilets: publicRegionItems(toilets, locale as Locale) }, {
      headers: { ...headers, 'X-Region-Marker-Cache': 'hit', 'X-Region-Marker-Path': 'worker' },
    })
  } catch { return null }
}
