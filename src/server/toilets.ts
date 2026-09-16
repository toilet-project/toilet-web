import 'server-only'
import { cache } from 'react'
import { connection } from 'next/server'
import type { ToiletDetailResponse } from '../api/toilets'
import { parseToiletId } from '../lib/toiletRoute'
import { reviewVerificationResponse } from '../../review-verification-proxy.mjs'
import { getSharedToiletBucket, readThroughSharedToiletCache, sharedToiletCacheEnabled } from './sharedToiletCache'

async function fetchPublicToiletOrigin(id: number): Promise<ToiletDetailResponse | null> {
  const origin = process.env.TOILET_API_ORIGIN || 'https://api.geupddong.com'
  const response = await fetch(`${origin.replace(/\/$/, '')}/api/v1/toilets/${id}`, {
    // The detail route is ISR. A no-store fetch here changes a statically
    // rendered route to dynamic at runtime and Next.js rejects the request.
    next: { revalidate: 2_592_000, tags: [`toilet:${id}`] }, signal: AbortSignal.timeout(10_000),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Public toilet detail unavailable (${response.status})`)
  const detail = await response.json() as ToiletDetailResponse
  if (detail.id !== id || typeof detail.name !== 'string') throw new Error('Invalid toilet detail response')
  return detail
}

// Public data only: never forward visitor cookies/Authorization into this shared cache.
export const getToilet = cache(async (rawId: string): Promise<ToiletDetailResponse | null> => {
  const id = parseToiletId(rawId)
  if (id === null) return null
  const verification = process.env.NEXT_PUBLIC_REVIEW_API_ENABLED === 'true'
    && process.env.NEXT_PUBLIC_API_BASE_URL === 'https://preview.geupddong.com/__review-verification'
  let response: Response
  if (verification) {
    // Never use the live facility API or shared cache for a synthetic acceptance page, including SSR.
    await connection()
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { env } = await getCloudflareContext({ async: true })
    const result = await reviewVerificationResponse(new Request(`https://preview.geupddong.com/__review-verification/api/v1/toilets/${id}`), env)
    if (!result) throw new Error('Synthetic fixture unavailable')
    if (!result.ok && result.status !== 404) {
      const code = (await result.clone().json().catch(() => null))?.error?.code
      if (['REVIEW_VERIFICATION_CONFIG_INVALID', 'REVIEW_VERIFICATION_FORWARD_FAILED'].includes(code)) console.error(code)
    }
    response = result
  } else {
    if (sharedToiletCacheEnabled()) {
      try {
        const bucket = await getSharedToiletBucket()
        if (bucket) return await readThroughSharedToiletCache({ bucket, toiletId: id,
          fetchOrigin: () => fetchPublicToiletOrigin(id) })
      } catch (error) {
        console.error('Shared toilet cache read-through failed', error)
        // Keep serving through Next's existing one-hour cache while the
        // independent R2 cache is unavailable or rejects an origin response.
        return fetchPublicToiletOrigin(id)
      }
    }
    return fetchPublicToiletOrigin(id)
  }
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Public toilet detail unavailable (${response.status})`)
  const detail = await response.json() as ToiletDetailResponse
  if (detail.id !== id || typeof detail.name !== 'string') throw new Error('Invalid toilet detail response')
  return detail
})
