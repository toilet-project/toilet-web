import { verifyIndexNowManageRequest } from '../../../../../indexnow-dispatch.mjs'
import { durableIndexNowEnabled } from '../../../../server/indexNowPipeline'
import { operateIndexNow, IndexNowOperationError } from '../../../../server/indexNowOperations'
import { createIndexNowRateLimit } from '../../../../server/indexNowRateLimit'
import { indexNowFailureInfo } from '../../../../server/indexNow'
import type { IndexNowOutboxBucket } from '../../../../server/indexNowOutbox'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
export async function POST(request: Request) {
  if (!durableIndexNowEnabled()) return Response.json({ state: 'disabled' }, { status: 404, headers })
  try {
    const operation = await verifyIndexNowManageRequest(request, process.env.CACHE_REVALIDATION_SECRET)
    if (!operation) return Response.json({ error: 'Rejected' }, { status: 401, headers })
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { env } = await getCloudflareContext({ async: true })
    const bucket = (env as Record<string, unknown>).PUBLIC_TOILET_DATA_CACHE_R2 as IndexNowOutboxBucket | undefined
    if (!bucket) throw new Error('IndexNow durable binding unavailable')
    const result = await operateIndexNow(bucket, operation, { check: () => createIndexNowRateLimit(bucket).check() })
    return Response.json(result, { status: ['conflict', 'ineligible'].includes(result.state) ? 409 : 200, headers })
  } catch (error) {
    if (error instanceof IndexNowOperationError) return Response.json({ error: 'Rejected' }, { status: 400, headers })
    const failure = indexNowFailureInfo(error)
    if (failure.reason === 'rate_limit') return Response.json({ state: 'cooldown', retryAt: failure.retryAt }, { status: 409, headers })
    console.error('IndexNow operation failed', failure)
    return Response.json({ error: 'Retry later' }, { status: 503, headers })
  }
}
