import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { localizedPublicPath, parseLocalizedPublicPath } from './i18n/routes'
import { parseRegionToiletSegment, regionToiletPath } from './lib/regionToiletPath'
import { getDistrict, getProvince, localizedRegionPath } from './lib/regions'
import { codeFromRegionSegment } from './lib/urlName'
import type { ToiletDetailResponse } from './api/toilets'

function canonicalRedirect(request: NextRequest, path: string) {
  const url = new URL(encodeURI(path), request.url)
  url.search = request.nextUrl.search
  return NextResponse.redirect(url, 308)
}

/** Canonicalize legacy region paths before a streamed page can turn a redirect into an HTML refresh. */
export async function proxy(request: NextRequest) {
  const parsed = parseLocalizedPublicPath(request.nextUrl.pathname)
  if (!parsed || !parsed.path.startsWith('/regions/')) return NextResponse.next()

  const segments = parsed.path.split('/').slice(1)
  if (segments.length !== 2 && segments.length !== 3 && segments.length !== 5) return NextResponse.next()
  const provinceCode = codeFromRegionSegment(segments[1], 2)
  const province = provinceCode ? getProvince(provinceCode) : null
  if (!province) return NextResponse.next()
  const districtCode = segments[2] && codeFromRegionSegment(segments[2], 5)
  const district = districtCode ? getDistrict(province.code, districtCode) : null
  if (segments[2] && !district) return NextResponse.next()

  const regionPath = localizedRegionPath(parsed.locale, province.code, district?.code)
  if (segments.length < 5) {
    if (regionPath === parsed.path) return NextResponse.next()
    return canonicalRedirect(request, localizedPublicPath(regionPath, parsed.locale)!)
  }
  if (segments[3] !== 'toilet' || regionPath === `/regions/${segments[1]}/${segments[2]}`) return NextResponse.next()
  const id = parseRegionToiletSegment(segments[4])
  if (id === null) return NextResponse.next()

  try {
    const origin = (process.env.TOILET_API_ORIGIN || 'https://api.geupddong.com').replace(/\/$/, '')
    const response = await fetch(`${origin}/api/v1/toilets/${id}`, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) return NextResponse.next()
    const detail = await response.json() as ToiletDetailResponse
    if (detail.id !== id || typeof detail.name !== 'string') return NextResponse.next()
    const path = localizedPublicPath(regionToiletPath(detail, parsed.locale), parsed.locale)!
    return canonicalRedirect(request, path)
  } catch {
    // Keep the normal page available if the public API is temporarily unavailable.
    return NextResponse.next()
  }
}

export const config = {
  matcher: ['/regions/:path*', '/en/regions/:path*', '/ja/regions/:path*',
    '/zh-cn/regions/:path*', '/zh-tw/regions/:path*', '/zh-hk/regions/:path*'],
}
