import type { R2BucketLike } from './sharedToiletCache'
import type { ToiletMapItemResponse } from '../api/toilets'
import { invalidateRegionMarkers } from '../lib/regionMarkerStore.ts'
export * from '../lib/regionMarkerStore.ts'

export async function getRegionMarkerBucket(): Promise<R2BucketLike | null> {
  if (process.env.CACHE_RUNTIME !== 'workers') return null
  const { getCloudflareContext } = await import('@opennextjs/cloudflare')
  const { env } = await getCloudflareContext({ async: true })
  const bucket = (env as Record<string, unknown>).PUBLIC_TOILET_DATA_CACHE_R2
  if (!bucket) throw new Error('Region marker R2 binding unavailable')
  return bucket as R2BucketLike
}

export async function persistRegionMarkerInvalidation(codes: string[] | null, captureBefore = false) {
  const previous = new Map<string, ToiletMapItemResponse[]>()
  if (process.env.REGION_MARKER_CACHE_ENABLED !== 'true') return previous
  const bucket = await getRegionMarkerBucket()
  if (bucket) await invalidateRegionMarkers(bucket, codes, Date.now,
    captureBefore ? (code, markers) => previous.set(code, markers) : undefined)
  return previous
}
