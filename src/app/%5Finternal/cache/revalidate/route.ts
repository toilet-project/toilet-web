import { revalidatePath, revalidateTag } from 'next/cache'
import { authenticateRevalidation, RevalidationError } from '../../../../server/cacheRevalidation'
import { persistWorkerInvalidation } from '../../../../server/workerInvalidation'
import { persistSharedToiletInvalidation } from '../../../../server/sharedToiletCache'
import { localizedPublicPath, localizedToiletPaths } from '../../../../i18n/routes'
import { SUPPORTED_LOCALES } from '../../../../i18n/locale'
import { getDistrict, localizedRegionPath } from '../../../../lib/regions'
import { districtCodesOverlappingBounds } from '../../../../server/regions'
import type { ScopedToiletCacheEvent } from '../../../../server/cacheRevalidation'
import { scheduleIndexNowNotification } from '../../../../server/indexNow'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
const MAX_SCOPED_DISTRICTS = 24

function affectedDistrictCodes(events: ScopedToiletCacheEvent[]): string[] | null {
  if (events.some(event => !event.regionScopeComplete)) return null
  const codes = new Set<string>()
  for (const event of events) {
    if (!event.regionBounds) continue
    for (const code of districtCodesOverlappingBounds(event.regionBounds)) {
      if (!getDistrict(code.slice(0, 2), code)) return null
      codes.add(code)
      if (codes.size > MAX_SCOPED_DISTRICTS) return null
    }
  }
  return [...codes]
}

export async function POST(request: Request) {
  try {
    const authenticated = await authenticateRevalidation(request, process.env.CACHE_REVALIDATION_SECRET)
    const ids = authenticated.events.map(event => event.toiletId)
    const catalogChanged = authenticated.events.some(event => event.catalogChanged)
    const districtCodes = authenticated.protocol === 'v3' ? affectedDistrictCodes(authenticated.events) : null
    // Both stores are attempted before acknowledgement. A partial failure returns 503 and the outbox retries.
    const persisted = await Promise.allSettled([
      persistWorkerInvalidation(ids, catalogChanged, districtCodes),
      authenticated.protocol !== 'v1' ? persistSharedToiletInvalidation(authenticated.events) : Promise.resolve(),
    ])
    for (const id of ids) {
      revalidateTag(`toilet:${id}`, { expire: 0 })
      for (const path of localizedToiletPaths(id)) revalidatePath(path)
    }
    if (districtCodes === null) {
      revalidateTag('region-markers', { expire: 0 })
      revalidatePath('/regions/[[...parts]]', 'page')
      revalidatePath('/[language]/regions/[[...parts]]', 'page')
    } else for (const code of districtCodes) {
      revalidateTag(`region-markers:${code}`, { expire: 0 })
      const district = getDistrict(code.slice(0, 2), code)!
      for (const locale of SUPPORTED_LOCALES) {
        const path = localizedPublicPath(localizedRegionPath(locale, district.provinceCode, code), locale)!
        revalidatePath(path)
      }
    }
    if (catalogChanged) {
      revalidateTag('toilet-catalog', { expire: 0 })
      revalidatePath('/sitemap.xml')
      revalidatePath('/sitemaps/[file]', 'page')
    }
    if (persisted.some(result => result.status === 'rejected')) throw new Error('Cache persistence failed')
    // Search discovery is best effort and must never delay or reject the cache outbox acknowledgement.
    await scheduleIndexNowNotification(authenticated.events)
    const acknowledgement = authenticated.protocol === 'v1'
      ? { ok: true, acceptedIds: ids }
      : { ok: true, acceptedEvents: authenticated.events.map(({ toiletId, revision }) => ({ toiletId, revision })) }
    return Response.json(acknowledgement, { headers })
  } catch (error) {
    const status = error instanceof RevalidationError ? error.status : 503
    return Response.json({ ok: false, error: status === 503 ? 'Retry later' : 'Rejected' }, { status, headers })
  }
}
