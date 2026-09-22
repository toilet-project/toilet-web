import { isLocale, SUPPORTED_LOCALES, type Locale } from './locale.ts'

const PUBLIC_PATH = /^\/(?:toilet\/[1-9]\d*|regions(?:\/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*(?:\/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*(?:\/toilet\/[1-9]\d*-[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*)?)?)?|account|policies\/(?:all|terms|privacy|location))?$/u

export function localeForPath(path: string | null): Locale {
  return localePrefix(path ?? '').locale
}

const prefixes: Readonly<Record<Locale, string>> = {
  ko: '', en: '/en', ja: '/ja', 'zh-CN': '/zh-cn', 'zh-TW': '/zh-tw', 'zh-HK': '/zh-hk',
}

function localePrefix(path: string): { locale: Locale; prefix: string } {
  for (const locale of SUPPORTED_LOCALES) {
    const prefix = prefixes[locale]
    if (prefix && (path === prefix || path.startsWith(`${prefix}/`))) return { locale, prefix }
  }
  return { locale: 'ko', prefix: '' }
}

export function isMapPath(path: string): boolean {
  const parsed = parseLocalizedPublicPath(path)
  return Boolean(parsed && !parsed.suffix && (parsed.path === '/' || parsed.path.startsWith('/toilet/') || /\/toilet\/[1-9]\d*-/.test(parsed.path)))
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
  // Decode native-script names, but never interpret encoded ASCII separators or aliases.
  if (/%[0-7][0-9a-f]/i.test(rawPath) || rawPath.includes('//')) return null
  let decoded: string
  try { decoded = decodeURIComponent(rawPath).normalize('NFC') } catch { return null }
  if (decoded.includes('%') || decoded.includes('//')) return null
  const normalized = decoded.length > 1 ? decoded.replace(/\/$/, '') : decoded
  const { locale, prefix } = localePrefix(normalized)
  const path = prefix ? normalized.slice(prefix.length) || '/' : normalized
  if (!PUBLIC_PATH.test(path)) return null
  if (path.startsWith('/toilet/') && !Number.isSafeInteger(Number(path.slice(8)))) return null
  return { locale, path, suffix }
}

/** Pure URL conversion; never reads visitor cookies, headers or local storage. */
export function localizedPublicPath(input: string, locale: Locale): string | null {
  if (!isLocale(locale)) return null
  const parsed = parseLocalizedPublicPath(input)
  if (!parsed) return null
  const path = `${prefixes[locale]}${parsed.path === '/' && locale !== 'ko' ? '' : parsed.path}`
  return path + parsed.suffix
}

/** A facility mutation affects every public language variant, even before translations exist. */
export function localizedToiletPaths(id: number): readonly string[] {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid toilet ID')
  return SUPPORTED_LOCALES.map(locale => `${prefixes[locale]}/toilet/${id}`)
}
