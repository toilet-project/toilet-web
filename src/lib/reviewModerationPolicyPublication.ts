import { reviewPolicyPublicationAttributes, type ReviewPolicyPublication } from './reviewPolicyPublication.ts'

// Independent of location verification, author unlinking and retention policies.
// Approved 2026-10-25 (KST) publication candidate. The public UI shows the day;
// actual publication is confirmed separately by the deployed release and HTTP.
export const reviewModerationPolicyPublication: ReviewPolicyPublication = {
  status: 'published',
  version: 'review-moderation-v1',
  announcedAt: '2026-10-24T16:14:02Z',
  effectiveAt: '2026-10-24T16:14:02Z',
}

export function reviewModerationPolicyPublicationAttributes(value: ReviewPolicyPublication) {
  const attributes = reviewPolicyPublicationAttributes(value)
  return Object.fromEntries(Object.entries(attributes).map(([key, item]) => [key.replace('data-review-policy-', 'data-review-moderation-policy-'), item]))
}
