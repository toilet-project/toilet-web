import { CacheMaintenanceError, authenticateCacheRefresh } from '../../../../server/cacheMaintenance'
import { getSharedToiletBucket, refreshSharedToiletCache } from '../../../../server/sharedToiletCache'
import { fetchPublicToiletOriginForMaintenance } from '../../../../server/toiletCacheMaintenance'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }

export async function POST(request: Request) {
  try {
    const { toiletId } = await authenticateCacheRefresh(request, process.env.CACHE_MAINTENANCE_SECRET)
    const bucket = await getSharedToiletBucket()
    if (!bucket) throw new CacheMaintenanceError(503, 'Shared cache unavailable')
    const record = await refreshSharedToiletCache({ bucket, toiletId,
      fetchOrigin: () => fetchPublicToiletOriginForMaintenance(toiletId) })
    return Response.json({ ok: true, toiletId, state: record.state, storedAt: record.storedAt }, { headers })
  } catch (error) {
    const status = error instanceof CacheMaintenanceError ? error.status : 503
    return Response.json({ ok: false, error: status === 503 ? 'Retry later' : 'Rejected' }, { status, headers })
  }
}
