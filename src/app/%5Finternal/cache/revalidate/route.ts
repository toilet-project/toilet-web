import { revalidatePath, revalidateTag } from 'next/cache'
import { authenticateRevalidation, RevalidationError } from '../../../../server/cacheRevalidation'
import { persistWorkerInvalidation } from '../../../../server/workerInvalidation'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }

export async function POST(request: Request) {
  try {
    const ids = await authenticateRevalidation(request, process.env.CACHE_REVALIDATION_SECRET)
    // On Workers, await durable tag persistence before acknowledging the sender.
    await persistWorkerInvalidation(ids)
    for (const id of ids) {
      revalidateTag(`toilet:${id}`, { expire: 0 })
      revalidatePath(`/toilet/${id}`)
    }
    return Response.json({ ok: true, acceptedIds: ids }, { headers })
  } catch (error) {
    const status = error instanceof RevalidationError ? error.status : 503
    return Response.json({ ok: false, error: status === 503 ? 'Retry later' : 'Rejected' }, { status, headers })
  }
}
