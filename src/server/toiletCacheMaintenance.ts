import type { ToiletDetailResponse } from '../api/toilets'

export async function fetchPublicToiletOriginForMaintenance(id: number): Promise<ToiletDetailResponse | null> {
  const origin = process.env.TOILET_API_ORIGIN || 'https://api.geupddong.com'
  const response = await fetch(`${origin.replace(/\/$/, '')}/api/v1/toilets/${id}`, {
    cache: 'no-store', signal: AbortSignal.timeout(10_000),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Public toilet detail unavailable (${response.status})`)
  const detail = await response.json() as ToiletDetailResponse
  if (detail.id !== id || typeof detail.name !== 'string') throw new Error('Invalid toilet detail response')
  return detail
}
