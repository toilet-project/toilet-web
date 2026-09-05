import 'server-only'
import { cache } from 'react'
import type { ToiletDetailResponse } from '../api/toilets'
import { parseToiletId } from '../lib/toiletRoute'

// Public data only: never forward visitor cookies/Authorization into this shared cache.
export const getToilet = cache(async (rawId: string): Promise<ToiletDetailResponse | null> => {
  const id = parseToiletId(rawId)
  if (id === null) return null
  const origin = process.env.TOILET_API_ORIGIN || 'https://api.geupddong.com'
  const response = await fetch(`${origin.replace(/\/$/, '')}/api/v1/toilets/${id}`, {
    next: { revalidate: 3600, tags: [`toilet:${id}`] },
    signal: AbortSignal.timeout(10_000),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Public toilet detail unavailable (${response.status})`)
  const detail = await response.json() as ToiletDetailResponse
  if (detail.id !== id || typeof detail.name !== 'string') throw new Error('Invalid toilet detail response')
  return detail
})
