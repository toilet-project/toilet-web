export type ReviewInput = { satisfaction: number; cleanliness: number; paper: boolean | null; waitMinutes: number; comment: string }
export type Review = ReviewInput & { id: string; toiletId: number; toiletName: string; createdAt: string; updatedAt: string; authorRemoved: boolean }
export const blankReview = (): ReviewInput => ({ satisfaction: 0, cleanliness: 0, paper: null, waitMinutes: 0, comment: '' })
export const reviewLength = (text: string) => Array.from(text).length
/** Display-only average for one review; preserve the original ratings for detail/edit. */
export const reviewAverageLabel = (review: Pick<Review, 'satisfaction' | 'cleanliness'>) => ((review.satisfaction + review.cleanliness) / 2).toFixed(1)
export const waitLabel = (minutes: number) => minutes === 60 ? '1시간 이상' : `${minutes}분`
export const canManageReview = (review: Pick<Review, 'authorRemoved' | 'createdAt'>, now = Date.now()) => {
  const created = Date.parse(review.createdAt)
  return !review.authorRemoved && Number.isFinite(created) && now >= created && now < created + 7 * 86_400_000
}
export function validateReview(value: ReviewInput): string | null {
  if (![value.satisfaction, value.cleanliness].every(n => Number.isInteger(n) && n >= 1 && n <= 5)) return '만족도와 청결도를 별점으로 선택해 주세요.'
  if (typeof value.paper !== 'boolean') return '화장지 유무를 선택해 주세요.'
  if (!Number.isInteger(value.waitMinutes) || value.waitMinutes < 0 || value.waitMinutes > 60 || value.waitMinutes % 10 !== 0) return '대기시간은 0~60분에서 10분 단위로 선택해 주세요.'
  if (reviewLength(value.comment) > 200) return '내용은 200자 이내로 입력해 주세요.'
  return null
}
