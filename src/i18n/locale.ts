/** Internal locale codes are BCP 47; KOR / EN are display labels only. */
export const SUPPORTED_LOCALES = ['ko', 'en'] as const
export type Locale = typeof SUPPORTED_LOCALES[number]
export const DEFAULT_LOCALE: Locale = 'ko'
export const LOCALE_STORAGE_KEY = 'geupddong.locale.v1'

export const LOCALE_OPTIONS = [
  { locale: 'ko', label: 'KOR', name: '한국어', languageTag: 'ko-KR', flag: '/flags/kr.svg' },
  { locale: 'en', label: 'EN', name: 'English', languageTag: 'en', flag: '/flags/us.svg' },
] as const

export function isLocale(value: unknown): value is Locale {
  return value === 'ko' || value === 'en'
}

type PreferenceReader = Pick<Storage, 'getItem'>
type PreferenceWriter = Pick<Storage, 'setItem'>

/** A preference is only a UI hint, never the input to public server rendering. */
export function readLocalePreference(storage: PreferenceReader): Locale | null {
  try {
    const value = storage.getItem(LOCALE_STORAGE_KEY)
    return isLocale(value) ? value : null
  } catch { return null }
}

export function rememberLocale(storage: PreferenceWriter, locale: Locale): boolean {
  if (!isLocale(locale)) return false
  try { storage.setItem(LOCALE_STORAGE_KEY, locale); return true } catch { return false }
}
