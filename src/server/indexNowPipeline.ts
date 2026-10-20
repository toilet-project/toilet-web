import type { ToiletCacheEvent } from './sharedToiletCache.ts'
import { readSharedToiletBeforeInvalidation } from './sharedToiletCache.ts'
import { readFreshRegionMarkers } from '../lib/regionMarkerStore.ts'
import { createIndexNowDelivery } from './indexNowDelivery.ts'
import type { IndexNowOutboxBucket } from './indexNowOutbox.ts'

export function durableIndexNowEnabled() {
  return process.env.SITE_INDEXABLE === 'true' && process.env.INDEXNOW_ENABLED === 'true'
    && process.env.INDEXNOW_OUTBOX_ENABLED === 'true'
}

/** Must be awaited before ANY cache mutation; failure leaves the sender event unacknowledged. */
export async function prepareDurableIndexNow(events: readonly ToiletCacheEvent[], codes: readonly string[]) {
  const { getCloudflareContext } = await import('@opennextjs/cloudflare')
  const { env } = await getCloudflareContext({ async: true })
  const bucket = (env as Record<string, unknown>).PUBLIC_TOILET_DATA_CACHE_R2 as IndexNowOutboxBucket | undefined
  if (!bucket) throw new Error('IndexNow durable binding unavailable')
  const delivery = createIndexNowDelivery(bucket)
  const keys = await delivery.prepare(events, codes, {
    detail: event => process.env.SHARED_TOILET_CACHE_ENABLED === 'true'
      ? readSharedToiletBeforeInvalidation(bucket, event) : Promise.resolve(null),
    district: code => process.env.REGION_MARKER_CACHE_ENABLED === 'true'
      ? readFreshRegionMarkers(bucket, code) : Promise.resolve(null),
  })
  return () => delivery.release(keys)
}
