import type { Locale } from '../i18n/locale.ts'
import { message } from '../i18n/messages.ts'

export type ReviewInput = { satisfaction: number; cleanliness: number; paper: boolean | null; waitMinutes: number; comment: string }
export type Review = ReviewInput & { id: string; toiletId: number; toiletName: string; createdAt: string; updatedAt: string; authorRemoved: boolean; canManage?: boolean }
export const blankReview = (): ReviewInput => ({ satisfaction: 0, cleanliness: 0, paper: null, waitMinutes: 0, comment: '' })
export const reviewLength = (text: string) => Array.from(text).length
export const REVIEW_CREATE_INTERVAL_MS = 24 * 60 * 60 * 1000
/** Preview frequency check includes unlinked reviews; never use updatedAt to extend the window. */
export function recentToiletReview<T extends Pick<Review, 'toiletId' | 'createdAt'>>(reviews: T[], toiletId: number, now = Date.now()): T | undefined {
  return reviews.filter(item => item.toiletId === toiletId && Number.isFinite(Date.parse(item.createdAt)) && now < Date.parse(item.createdAt) + REVIEW_CREATE_INTERVAL_MS)
    .reduce<T | undefined>((latest, item) => !latest || Date.parse(item.createdAt) > Date.parse(latest.createdAt) ? item : latest, undefined)
}
/** Display-only average for one review; preserve the original ratings for detail/edit. */
export const reviewAverageLabel = (review: Pick<Review, 'satisfaction' | 'cleanliness'>) => ((review.satisfaction + review.cleanliness) / 2).toFixed(1)
export const waitLabel = (minutes: number, locale: Locale = 'ko') => minutes === 60 ? message(locale, 'review.hourPlus') : message(locale, 'review.minutes', { minutes })
export const canManageReview = (review: Pick<Review, 'authorRemoved' | 'createdAt' | 'canManage'>, now = Date.now()) => {
  const created = Date.parse(review.createdAt)
  return review.canManage !== false && !review.authorRemoved && Number.isFinite(created) && now >= created && now < created + 7 * 86_400_000
}
export function validateReview(value: ReviewInput, locale: Locale = 'ko'): string | null {
  if (![value.satisfaction, value.cleanliness].every(n => Number.isInteger(n) && n >= 1 && n <= 5)) return message(locale, 'review.invalidRatings')
  if (typeof value.paper !== 'boolean') return message(locale, 'review.invalidPaper')
  if (!Number.isInteger(value.waitMinutes) || value.waitMinutes < 0 || value.waitMinutes > 60 || value.waitMinutes % 10 !== 0) return message(locale, 'review.invalidWait')
  if (reviewLength(value.comment) > 200) return message(locale, 'review.invalidComment')
  return null
}
