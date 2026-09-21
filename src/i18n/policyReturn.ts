import { isLocale, type Locale } from './locale.ts'
import { isMapPath, parseLocalizedPublicPath } from './routes.ts'

/** A same-origin language route beats a possibly stale stored preference. */
export function policyReturnLocale(preferred: Locale | null, referrer: string, origin: string, requested?: string | null): Locale {
  if (isLocale(requested)) return requested
  try {
    const previous = new URL(referrer)
    if (previous.origin === origin) {
      const locale = parseLocalizedPublicPath(previous.pathname)?.locale
      if (locale && (isMapPath(previous.pathname) || locale !== 'ko')) return locale
    }
  } catch { /* Direct visits have no referrer. */ }
  return preferred ?? 'ko'
}

/** Keep the map language explicit when opening the Korean source, including a new tab. */
export function koreanPolicySourcePath(path: string, locale: Locale): string {
  const parsed = parseLocalizedPublicPath(path)
  if (!parsed || !parsed.path.startsWith('/policies/') || locale === 'ko') return path
  return `${parsed.path}?return=${encodeURIComponent(locale)}${parsed.suffix.startsWith('#') ? parsed.suffix : ''}`
}
