import { createApiUrl } from '../config/api'
import { fetchSessionRead } from './session'
import { decodeGrowth, type GrowthResponse } from '../lib/growth'

export class GrowthSessionExpired extends Error {}
async function responseValue(response: Response): Promise<GrowthResponse> {
  if (response.status === 401) throw new GrowthSessionExpired()
  if (!response.ok) throw new Error('GROWTH_UNAVAILABLE')
  return decodeGrowth(await response.json())
}
export async function fetchGrowth(): Promise<GrowthResponse> {
  return responseValue(await fetchSessionRead(createApiUrl('/api/v1/growth/me')))
}
/** Idempotency and eligibility are enforced by the server; mutations are never replayed by the session reader. */
export async function checkInGrowth(): Promise<GrowthResponse> {
  return responseValue(await fetch(createApiUrl('/api/v1/growth/check-in'), { method: 'POST', credentials: 'include', cache: 'no-store' }))
}
export type GrowthHistoryItem = { id: string; deltaXp: number; type: string; reason: string; happenedAt: string }
export async function fetchGrowthHistory(): Promise<GrowthHistoryItem[]> {
  const response = await fetchSessionRead(createApiUrl('/api/v1/growth/history'))
  if (response.status === 401) throw new GrowthSessionExpired()
  if (!response.ok) throw new Error('GROWTH_HISTORY_UNAVAILABLE')
  const value = await response.json() as { items?: unknown }
  if (!Array.isArray(value?.items)) throw new Error('INVALID_GROWTH_HISTORY')
  return value.items.map(item => {
    if (!item || typeof item !== 'object') throw new Error('INVALID_GROWTH_HISTORY')
    const v = item as Record<string, unknown>
    if (!(typeof v.id === 'string' && /^[1-9]\d*$/.test(v.id) || Number.isSafeInteger(v.id) && Number(v.id) > 0)
      || !Number.isSafeInteger(v.deltaXp) || typeof v.type !== 'string' || typeof v.reason !== 'string' || typeof v.happenedAt !== 'string') throw new Error('INVALID_GROWTH_HISTORY')
    return { id: String(v.id), deltaXp: Number(v.deltaXp), type: v.type, reason: v.reason, happenedAt: v.happenedAt }
  })
}
