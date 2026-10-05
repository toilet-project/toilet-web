import { createApiUrl } from '../config/api'
import { fetchSessionRead } from './session'
import { decodeGrowth, type GrowthResponse } from '../lib/growth'
import { decodeGrowthHistory, decodeGrowthHistoryPage, GROWTH_HISTORY_PAGE_SIZE, type GrowthHistoryDirection, type GrowthHistoryItem, type GrowthHistoryPage } from '../lib/growthHistory'

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
export type { GrowthHistoryItem } from '../lib/growthHistory'
export async function fetchGrowthHistory(): Promise<GrowthHistoryItem[]> {
  const response = await fetchSessionRead(createApiUrl('/api/v1/growth/history'))
  if (response.status === 401) throw new GrowthSessionExpired()
  if (!response.ok) throw new Error('GROWTH_HISTORY_UNAVAILABLE')
  return decodeGrowthHistory(await response.json())
}
export async function fetchGrowthHistoryPage(direction: GrowthHistoryDirection, page: number): Promise<GrowthHistoryPage> {
  const query = new URLSearchParams({ direction, page: String(page), size: String(GROWTH_HISTORY_PAGE_SIZE) })
  const response = await fetchSessionRead(createApiUrl(`/api/v1/growth/history?${query}`))
  if (response.status === 401) throw new GrowthSessionExpired()
  if (!response.ok) throw new Error('GROWTH_HISTORY_UNAVAILABLE')
  return decodeGrowthHistoryPage(await response.json(), direction, page)
}
