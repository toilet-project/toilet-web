import { checkInGrowth, fetchGrowth, GrowthSessionExpired } from '../api/growth'
import { GROWTH_ENABLED } from './growth'
import { createGrowthStore } from './growthStore'

export const memberGrowth = createGrowthStore({ enabled: GROWTH_ENABLED, read: fetchGrowth, checkIn: checkInGrowth, expired: error => error instanceof GrowthSessionExpired })
export function refreshGrowth(owner: string | null) { if (owner) void memberGrowth.refresh(owner) }
export function clearGrowth() { memberGrowth.clear() }
