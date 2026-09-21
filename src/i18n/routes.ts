import { isLocale, type Locale } from './locale.ts'

const PUBLIC_PATH = /^\/(?:toilet\/[1-9]\d*|policies\/(?:all|terms|privacy|location))?$/

export function localeForPath(path: string | null): Locale {
  return path === '/en' || path?.startsWith('/en/') ? 'en' : 'ko'
}

export function isMapPath(path: string): boolean {
  const parsed = parseLocalizedPublicPath(path)
  return Boolean(parsed && !parsed.suffix && (parsed.path === '/' || parsed.path.startsWith('/toilet/')))
}

export function isLanguageOnlyNavigation(previous: string, next: string): boolean {
  if (!isMapPath(previous) || !isMapPath(next)) return false
  const a = parseLocalizedPublicPath(previous)!, b = parseLocalizedPublicPath(next)!
  return a.locale !== b.locale && a.path === b.path
}

/** Parse only supported public routes. Never rewrite API, admin, assets or preview paths. */
export function parseLocalizedPublicPath(input: string): { locale: Locale; path: string; suffix: string } | null {
  const hasControlCharacter = Array.from(input).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  if (!input.startsWith('/') || input.startsWith('//') || /[\\\s]/.test(input) || hasControlCharacter) return null
  const boundary = input.search(/[?#]/)
  const rawPath = boundary < 0 ? input : input.slice(0, boundary)
  const suffix = boundary < 0 ? '' : input.slice(boundary)
  // Do not interpret encoded separators, aliases or traversal as a supported route.
  if (rawPath.includes('%') || rawPath.includes('//')) return null
  const normalized = rawPath.length > 1 ? rawPath.replace(/\/$/, '') : rawPath
  const locale = normalized === '/en' || normalized.startsWith('/en/') ? 'en' : 'ko'
  const path = locale === 'en' ? normalized.slice(3) || '/' : normalized
  if (!PUBLIC_PATH.test(path)) return null
  if (path.startsWith('/toilet/') && !Number.isSafeInteger(Number(path.slice(8)))) return null
  return { locale, path, suffix }
}

/** Pure URL conversion; never reads visitor cookies, headers or local storage. */
export function localizedPublicPath(input: string, locale: Locale): string | null {
  if (!isLocale(locale)) return null
  const parsed = parseLocalizedPublicPath(input)
  if (!parsed) return null
  const path = locale === 'en' ? `/en${parsed.path === '/' ? '' : parsed.path}` : parsed.path
  return path + parsed.suffix
}

/** Use when wiring revalidation: a facility mutation affects both public language variants. */
export function localizedToiletPaths(id: number): readonly [string, string] {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid toilet ID')
  return [`/toilet/${id}`, `/en/toilet/${id}`]
}
