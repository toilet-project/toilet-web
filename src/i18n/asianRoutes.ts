import type { Locale } from './locale'

/** Route segments stay lowercase; translation keys retain their BCP 47 region. */
export function asianLocaleForSegment(segment: string): Exclude<Locale, 'ko' | 'en'> | null {
  switch (segment) {
    case 'ja': return 'ja'
    case 'zh-cn': return 'zh-CN'
    case 'zh-tw': return 'zh-TW'
    case 'zh-hk': return 'zh-HK'
    default: return null
  }
}

