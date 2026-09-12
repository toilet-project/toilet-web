import { REVIEW_DESIGN_PREVIEW, useIntegratedReviewPreview } from './useIntegratedReviewPreview'
import { useReviewApi } from './useReviewApi'

// Build-time only: no URL, storage or API failure can switch on real writes.
export const REVIEW_API_ENABLED = process.env.NEXT_PUBLIC_REVIEW_API_ENABLED === 'true'
export const REVIEW_UI_ENABLED = REVIEW_DESIGN_PREVIEW || REVIEW_API_ENABLED
export const useReviews = REVIEW_API_ENABLED ? useReviewApi : useIntegratedReviewPreview
