/** UI, URL and translation lookups retain regional Chinese variants separately. */
export const SUPPORTED_LOCALES = ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'zh-HK'] as const
export type Locale = typeof SUPPORTED_LOCALES[number]
export const DEFAULT_LOCALE: Locale = 'ko'
export const LOCALE_STORAGE_KEY = 'geupddong.locale.v1'

export const LOCALE_OPTIONS = [
  { locale: 'ko', label: 'KOR', name: '한국어', languageTag: 'ko-KR', flag: '/flags/kr.svg' },
  { locale: 'en', label: 'EN', name: 'English', languageTag: 'en', flag: '/flags/us.svg' },
  { locale: 'ja', label: 'JA', name: '日本語', languageTag: 'ja', flag: '/flags/jp.svg' },
  { locale: 'zh-CN', label: '简', name: '简体中文（中国）', languageTag: 'zh-CN', flag: '/flags/cn.svg' },
  { locale: 'zh-TW', label: '繁', name: '繁體中文（台灣）', languageTag: 'zh-TW', flag: '/flags/tw.svg' },
  { locale: 'zh-HK', label: '繁', name: '繁體中文（香港）', languageTag: 'zh-HK', flag: '/flags/hk.svg' },
] as const

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED_LOCALES.some(locale => locale === value)
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
