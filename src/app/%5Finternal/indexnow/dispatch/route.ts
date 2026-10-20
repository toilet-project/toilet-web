import { verifyIndexNowDispatchRequest } from '../../../../../indexnow-dispatch.mjs'
import { durableIndexNowEnabled } from '../../../../server/indexNowPipeline'
import { dispatchIndexNow } from '../../../../server/indexNowDispatcher'
import { fetchCurrentDetail, indexNowFailureInfo, submitIndexNow } from '../../../../server/indexNow'
import { resolveIndexNowIntent } from '../../../../server/indexNowDelivery'
import { createIndexNowRateLimit } from '../../../../server/indexNowRateLimit'
import { getCurrentDistrictToiletsForIndexNow } from '../../../../server/regions'
import type { IndexNowOutboxBucket } from '../../../../server/indexNowOutbox'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
export async function POST(request: Request) {
  if (!durableIndexNowEnabled()) return Response.json({ state: 'disabled' }, { status: 404, headers })
  try {
    if (!await verifyIndexNowDispatchRequest(request, process.env.CACHE_REVALIDATION_SECRET))
      return Response.json({ error: 'Rejected' }, { status: 401, headers })
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { env } = await getCloudflareContext({ async: true })
    const bucket = (env as Record<string, unknown>).PUBLIC_TOILET_DATA_CACHE_R2 as IndexNowOutboxBucket | undefined
    if (!bucket) throw new Error('IndexNow durable binding unavailable')
    const limiter = createIndexNowRateLimit(bucket)
    const startedAt = Date.now()
    const result = await dispatchIndexNow({ enabled: true, bucket, check: () => limiter.check(),
      resolve: intent => resolveIndexNowIntent(intent, {
        detail: id => fetchCurrentDetail(id, fetch),
        district: code => getCurrentDistrictToiletsForIndexNow(code.slice(0, 2), code),
      }),
      // Durable retry owns failures. No immediate retry loop in this bounded scheduled invocation.
      send: paths => submitIndexNow(paths, fetch, undefined, limiter, 1),
    })
    console.info('IndexNow durable dispatch', { ...result, elapsedMs: Date.now() - startedAt })
    return Response.json(result, { headers })
  } catch (error) {
    const failure = indexNowFailureInfo(error)
    console.error('IndexNow durable dispatch failed', failure)
    if (failure.reason === 'rate_limit') return Response.json({ state: 'cooldown' }, { headers })
    return Response.json({ error: 'Retry later' }, { status: 503, headers })
  }
}
