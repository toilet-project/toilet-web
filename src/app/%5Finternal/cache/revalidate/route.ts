import { revalidatePath, revalidateTag } from 'next/cache'
import { authenticateRevalidation, RevalidationError } from '../../../../server/cacheRevalidation'
import { persistWorkerInvalidation } from '../../../../server/workerInvalidation'
import { persistSharedToiletInvalidation } from '../../../../server/sharedToiletCache'
import { localizedToiletPaths } from '../../../../i18n/routes'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }

export async function POST(request: Request) {
  try {
    const authenticated = await authenticateRevalidation(request, process.env.CACHE_REVALIDATION_SECRET)
    const ids = authenticated.events.map(event => event.toiletId)
    const catalogChanged = authenticated.events.some(event => event.catalogChanged)
    // Both stores are attempted before acknowledgement. A partial failure returns 503 and the outbox retries.
    const persisted = await Promise.allSettled([
      persistWorkerInvalidation(ids, catalogChanged),
      authenticated.protocol === 'v2' ? persistSharedToiletInvalidation(authenticated.events) : Promise.resolve(),
    ])
    for (const id of ids) {
      revalidateTag(`toilet:${id}`, { expire: 0 })
      for (const path of localizedToiletPaths(id)) revalidatePath(path)
    }
    revalidateTag('region-markers', { expire: 0 })
    revalidatePath('/regions/[[...parts]]', 'page')
    revalidatePath('/[language]/regions/[[...parts]]', 'page')
    if (catalogChanged) {
      revalidateTag('toilet-catalog', { expire: 0 })
      revalidatePath('/sitemap.xml')
      revalidatePath('/sitemaps/[file]', 'page')
    }
    if (persisted.some(result => result.status === 'rejected')) throw new Error('Cache persistence failed')
    const acknowledgement = authenticated.protocol === 'v1'
      ? { ok: true, acceptedIds: ids }
      : { ok: true, acceptedEvents: authenticated.events.map(({ toiletId, revision }) => ({ toiletId, revision })) }
    return Response.json(acknowledgement, { headers })
  } catch (error) {
    const status = error instanceof RevalidationError ? error.status : 503
    return Response.json({ ok: false, error: status === 503 ? 'Retry later' : 'Rejected' }, { status, headers })
  }
}
