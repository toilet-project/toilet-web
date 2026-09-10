export type AccountPolicyPublication = {
  status: 'draft' | 'published'
  version: string
  announcedAt: string | null
  effectiveAt: string | null
}

// Dates/status are changed only in a separately approved policy publication release.
export const accountPolicyPublication: AccountPolicyPublication = {
  status: 'draft',
  version: 'account-local-retention-v1',
  announcedAt: null,
  effectiveAt: null,
}

export function policyPublicationAttributes(value: AccountPolicyPublication) {
  if (!/^[a-z0-9-]{1,60}$/.test(value.version)) throw new Error('INVALID_POLICY_VERSION')
  if (value.status !== 'draft' && value.status !== 'published') throw new Error('INVALID_POLICY_STATUS')
  if (value.status === 'published') {
    const dates = [value.announcedAt, value.effectiveAt]
    if (dates.some(date => !date || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(date)
      || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString() !== date.replace('Z', '.000Z'))
      || Date.parse(value.announcedAt!) > Date.parse(value.effectiveAt!)) throw new Error('INVALID_POLICY_DATES')
  } else if (value.announcedAt !== null || value.effectiveAt !== null) {
    throw new Error('DRAFT_POLICY_HAS_DATES')
  }
  return {
    'data-account-policy-status': value.status,
    'data-account-policy-version': value.version,
    'data-account-policy-announced-at': value.announcedAt ?? '',
    'data-account-policy-effective-at': value.effectiveAt ?? '',
  }
}
