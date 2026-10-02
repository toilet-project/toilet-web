import type { Locale } from '../i18n/locale'
import { localizedPublicPath } from '../i18n/routes.ts'

/** A public facility link. Never copy current query strings, GPS or attribution. */
export function buildFacilityShareLink(id: number, locale: Locale, method: 'share' | 'copy') {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid facility')
  const url = new URL(localizedPublicPath(`/toilet/${id}`, locale)!, 'https://geupddong.com')
  url.searchParams.set('utm_source', method === 'copy' ? 'copy_link' : 'share_link')
  url.searchParams.set('utm_medium', 'referral')
  return url.href
}
