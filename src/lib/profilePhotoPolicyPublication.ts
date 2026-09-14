export type ProfilePhotoPolicyPublication = {
  status: 'draft' | 'published'
  version: string
  announcedAt: string | null
  effectiveAt: string | null
}

// Profile-photo storage is published independently so its audit marker does
// not rewrite the earlier account-retention or review-policy releases.
export const profilePhotoPolicyPublication: ProfilePhotoPolicyPublication = {
  status: 'published',
  version: 'profile-photo-us-r2-public-cdn-v3',
  announcedAt: '2026-09-14T19:30:00Z',
  effectiveAt: '2026-09-14T19:30:00Z',
}

export function profilePhotoPolicyPublicationAttributes(value: ProfilePhotoPolicyPublication) {
  if (!/^[a-z0-9-]{1,60}$/.test(value.version)) throw new Error('INVALID_PROFILE_PHOTO_POLICY_VERSION')
  if (value.status !== 'draft' && value.status !== 'published') throw new Error('INVALID_PROFILE_PHOTO_POLICY_STATUS')
  if (value.status === 'published') {
    const dates = [value.announcedAt, value.effectiveAt]
    if (dates.some(date => !date || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(date)
      || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString() !== date.replace('Z', '.000Z'))
      || Date.parse(value.announcedAt!) > Date.parse(value.effectiveAt!)) throw new Error('INVALID_PROFILE_PHOTO_POLICY_DATES')
  } else if (value.announcedAt !== null || value.effectiveAt !== null) {
    throw new Error('DRAFT_PROFILE_PHOTO_POLICY_HAS_DATES')
  }
  return {
    'data-profile-photo-policy-status': value.status,
    'data-profile-photo-policy-version': value.version,
    'data-profile-photo-policy-announced-at': value.announcedAt ?? '',
    'data-profile-photo-policy-effective-at': value.effectiveAt ?? '',
  }
}
