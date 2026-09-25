import { publicToiletResponse } from '../../../../../lib/publicToiletResponse'
import { getSharedToiletBucket, readThroughSharedToiletCache, sanitizePublicToiletDetail } from '../../../../../server/sharedToiletCache'
import { fetchPublicToiletOriginForMaintenance } from '../../../../../server/toiletCacheMaintenance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  return publicToiletResponse(id, async toiletId => {
    const fetchOrigin = async () => {
      const detail = await fetchPublicToiletOriginForMaintenance(toiletId)
      return detail === null ? null : sanitizePublicToiletDetail(detail, toiletId)
    }
    const bucket = await getSharedToiletBucket()
    return bucket ? readThroughSharedToiletCache({ bucket, toiletId, fetchOrigin }) : fetchOrigin()
  })
}
