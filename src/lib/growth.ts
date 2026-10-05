export const GROWTH_ENABLED = process.env.NEXT_PUBLIC_GROWTH_ENABLED === 'true'
export const growthRanks = [
  { key: 'white', file: '01-sprout', min: 1, max: 2, color: '#82958a', soft: '#f2f4ef', bar: '#f8faf6' },
  { key: 'green', file: '02-heart', min: 3, max: 4, color: '#258d60', soft: '#e4f4e9', bar: '#84ca91' },
  { key: 'yellow', file: '03-flame', min: 5, max: 9, color: '#ad821c', soft: '#fff5d7', bar: '#f4d36b' },
  { key: 'blue', file: '04-bolt', min: 10, max: 14, color: '#4c82c3', soft: '#e9f1fc', bar: '#85b7f1' },
  { key: 'red', file: '05-star', min: 15, max: 24, color: '#c26065', soft: '#fceced', bar: '#ef8478' },
  { key: 'pink', file: '06-crown', min: 25, max: 39, color: '#ba658c', soft: '#fbeaf2', bar: '#eaa6d1' },
  { key: 'black', file: '07-legend', min: 40, max: null, color: '#414c46', soft: '#e9eeea', bar: '#28313d' },
] as const
export type GrowthRank = typeof growthRanks[number]['key']
export type MedalTier = 'bronze' | 'silver' | 'gold'
export type GrowthBadge = { type: 'district' | 'regional_medal'; code: string; name: string; tier: MedalTier | null; xp: number; earnedAt: string }
export type GrowthRegion = { code: string; name: string; targetDistricts: number; earnedDistricts: number; distinctFacilities: number; tier: MedalTier | null; bronzeFacilities: number; silverFacilities: number; goldFacilities: number; silverDistricts: number; goldDistricts: number }
export type GrowthSummary = { enabled: true; policyVersion: string; totalXp: number; level: number; rank: GrowthRank; nextLevel: number; nextLevelXp: number; remainingXp: number; progressPercent: number; checkInAvailable: boolean; badges: GrowthBadge[]; regions: GrowthRegion[] }
export type GrowthResponse = GrowthSummary | { enabled: false }
export const growthTotalXp = (level: number) => 10 * (level * level - 1)
export function growthRankFor(level: number) { return growthRanks.find(rank => level >= rank.min && (rank.max === null || level <= rank.max)) ?? growthRanks[0] }
export function growthIconPath(rank: GrowthRank, size: number, reducedMotion: boolean) {
  const value = growthRanks.find(item => item.key === rank)!
  const animated = value.min >= 15 && !reducedMotion
  return `/growth/rank-icons/v14/${size <= 24 ? 'compact/' : animated ? 'animated/' : ''}${value.file}.${animated ? 'gif' : 'svg'}`
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_GROWTH_RESPONSE')
  return value as Record<string, unknown>
}
function integer(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new Error('INVALID_GROWTH_RESPONSE')
  return value as number
}
function text(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500) throw new Error('INVALID_GROWTH_RESPONSE')
  return value
}
function tier(value: unknown): MedalTier | null {
  if (value !== null && value !== 'bronze' && value !== 'silver' && value !== 'gold') throw new Error('INVALID_GROWTH_RESPONSE')
  return value
}
export function decodeGrowth(value: unknown): GrowthResponse {
  const v = record(value)
  if (v.enabled === false) return { enabled: false }
  if (v.enabled !== true || typeof v.checkInAvailable !== 'boolean' || !Array.isArray(v.badges) || !Array.isArray(v.regions)) throw new Error('INVALID_GROWTH_RESPONSE')
  const totalXp = integer(v.totalXp), level = integer(v.level, 1), nextLevel = integer(v.nextLevel, 2)
  const nextLevelXp = integer(v.nextLevelXp), remainingXp = integer(v.remainingXp)
  if (level !== Math.floor(Math.sqrt(totalXp / 10 + 1)) || nextLevel !== level + 1 || nextLevelXp !== growthTotalXp(nextLevel)
    || remainingXp !== nextLevelXp - totalXp || growthRankFor(level).key !== v.rank || typeof v.progressPercent !== 'number' || !Number.isFinite(v.progressPercent) || v.progressPercent < 0 || v.progressPercent > 100) throw new Error('INVALID_GROWTH_RESPONSE')
  const badges = v.badges.map(value => {
    const badge = record(value)
    if (badge.type !== 'district' && badge.type !== 'regional_medal') throw new Error('INVALID_GROWTH_RESPONSE')
    return { type: badge.type, code: text(badge.code), name: text(badge.name), tier: tier(badge.tier), xp: integer(badge.xp), earnedAt: text(badge.earnedAt) } as GrowthBadge
  })
  const regions = v.regions.map(value => {
    const region = record(value)
    return { code: text(region.code), name: text(region.name), targetDistricts: integer(region.targetDistricts), earnedDistricts: integer(region.earnedDistricts), distinctFacilities: integer(region.distinctFacilities), tier: tier(region.tier), bronzeFacilities: integer(region.bronzeFacilities), silverFacilities: integer(region.silverFacilities), goldFacilities: integer(region.goldFacilities), silverDistricts: integer(region.silverDistricts), goldDistricts: integer(region.goldDistricts) }
  })
  return { enabled: true, policyVersion: text(v.policyVersion), totalXp, level, rank: v.rank as GrowthRank, nextLevel, nextLevelXp, remainingXp, progressPercent: v.progressPercent, checkInAvailable: v.checkInAvailable, badges, regions }
}
