import type { Locale } from './locale.ts'
import { isMapPath, parseLocalizedPublicPath } from './routes.ts'

/** A same-origin language route beats a possibly stale stored preference. */
export function policyReturnLocale(preferred: Locale | null, referrer: string, origin: string): Locale {
  try {
    const previous = new URL(referrer)
    if (previous.origin === origin) {
      const locale = parseLocalizedPublicPath(previous.pathname)?.locale
      if (locale && (isMapPath(previous.pathname) || locale !== 'ko')) return locale
    }
  } catch { /* Direct visits have no referrer. */ }
  return preferred ?? 'ko'
}
