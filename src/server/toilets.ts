import 'server-only'
import { cache } from 'react'
import type { ToiletDetailResponse } from '../api/toilets'
import { parseToiletId } from '../lib/toiletRoute'
import { reviewVerificationResponse } from '../../review-verification-proxy.mjs'

// Public data only: never forward visitor cookies/Authorization into this shared cache.
export const getToilet = cache(async (rawId: string): Promise<ToiletDetailResponse | null> => {
  const id = parseToiletId(rawId)
  if (id === null) return null
  const verification = process.env.NEXT_PUBLIC_REVIEW_API_ENABLED === 'true'
    && process.env.NEXT_PUBLIC_API_BASE_URL === 'https://preview.geupddong.com/__review-verification'
  let response: Response
  if (verification) {
    // Never use the live facility API or shared cache for a synthetic acceptance page, including SSR.
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { env } = await getCloudflareContext({ async: true })
    const result = await reviewVerificationResponse(new Request(`https://preview.geupddong.com/__review-verification/api/v1/toilets/${id}`), env)
    if (!result) throw new Error('Synthetic fixture unavailable')
    response = result
  } else {
    const origin = process.env.TOILET_API_ORIGIN || 'https://api.geupddong.com'
    response = await fetch(`${origin.replace(/\/$/, '')}/api/v1/toilets/${id}`, {
    next: { revalidate: 3600, tags: [`toilet:${id}`] },
    signal: AbortSignal.timeout(10_000),
    })
  }
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Public toilet detail unavailable (${response.status})`)
  const detail = await response.json() as ToiletDetailResponse
  if (detail.id !== id || typeof detail.name !== 'string') throw new Error('Invalid toilet detail response')
  return detail
})
