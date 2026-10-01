import type { Locale } from '../i18n/locale'
import { engagementMessage } from '../i18n/engagementMessages.ts'
export type ReviewCrowding = { status: 'UNKNOWN' | 'CLEAR' | 'UNDER_FIVE' | 'WAIT'; waitLowerBound: number | null; sampleCount: number; zeroWaitCount: number; averageWaitMinutes: number | null; windowDays: number; latestReviewAt: string | null }
export function decodeCrowding(value: unknown): ReviewCrowding | undefined {
  if (value === undefined) return undefined // Older APIs remain readable during a staged rollout.
  if (!value || typeof value !== 'object') throw new Error('Invalid review crowding')
  const r = value as ReviewCrowding
  if (!['UNKNOWN', 'CLEAR', 'UNDER_FIVE', 'WAIT'].includes(r.status) || !Number.isSafeInteger(r.sampleCount) || r.sampleCount < 0
    || !Number.isSafeInteger(r.zeroWaitCount) || r.zeroWaitCount < 0 || r.zeroWaitCount > r.sampleCount || r.windowDays !== 7
    || !(r.averageWaitMinutes === null || Number.isFinite(r.averageWaitMinutes) && r.averageWaitMinutes >= 0 && r.averageWaitMinutes <= 60)
    || !(r.waitLowerBound === null || Number.isInteger(r.waitLowerBound) && r.waitLowerBound >= 0 && r.waitLowerBound <= 60 && r.waitLowerBound % 5 === 0)
    || !(r.latestReviewAt === null || typeof r.latestReviewAt === 'string' && Number.isFinite(Date.parse(r.latestReviewAt)))
    || (r.status === 'UNKNOWN' ? r.sampleCount !== 0 || r.averageWaitMinutes !== null || r.waitLowerBound !== null : r.sampleCount === 0 || r.averageWaitMinutes === null || r.waitLowerBound === null)) throw new Error('Invalid review crowding')
  return { status: r.status, waitLowerBound: r.waitLowerBound, sampleCount: r.sampleCount, zeroWaitCount: r.zeroWaitCount, averageWaitMinutes: r.averageWaitMinutes, windowDays: r.windowDays, latestReviewAt: r.latestReviewAt }
}
export function crowdingLabel(value: ReviewCrowding, locale: Locale) {
  return engagementMessage(locale, value.status === 'CLEAR' ? 'clear' : value.status === 'UNDER_FIVE' ? 'underFive' : value.status === 'WAIT' ? 'wait' : 'unknown', { n: value.waitLowerBound ?? 0 })
}
