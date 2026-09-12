export type ReviewPolicyPublication = {
  status: 'draft' | 'published'
  version: string
  announcedAt: string | null
  effectiveAt: string | null
}

// Review policy publication is tracked separately from the account-retention
// policy so releasing one cannot rewrite the audit marker for the other.
export const reviewPolicyPublication: ReviewPolicyPublication = {
  status: 'published',
  version: 'location-verified-reviews-v1',
  announcedAt: '2026-09-12T09:30:00Z',
  effectiveAt: '2026-09-12T09:30:00Z',
}

export function reviewPolicyPublicationAttributes(value: ReviewPolicyPublication) {
  if (!/^[a-z0-9-]{1,60}$/.test(value.version)) throw new Error('INVALID_REVIEW_POLICY_VERSION')
  if (value.status !== 'draft' && value.status !== 'published') throw new Error('INVALID_REVIEW_POLICY_STATUS')
  if (value.status === 'published') {
    const dates = [value.announcedAt, value.effectiveAt]
    if (dates.some(date => !date || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(date)
      || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString() !== date.replace('Z', '.000Z'))
      || Date.parse(value.announcedAt!) > Date.parse(value.effectiveAt!)) throw new Error('INVALID_REVIEW_POLICY_DATES')
  } else if (value.announcedAt !== null || value.effectiveAt !== null) {
    throw new Error('DRAFT_REVIEW_POLICY_HAS_DATES')
  }
  return {
    'data-review-policy-status': value.status,
    'data-review-policy-version': value.version,
    'data-review-policy-announced-at': value.announcedAt ?? '',
    'data-review-policy-effective-at': value.effectiveAt ?? '',
  }
}
