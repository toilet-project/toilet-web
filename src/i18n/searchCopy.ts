import type { Locale } from './locale'

// A search-intent question, not an assertion that every listed facility is free.
const freeRestroomPrompt: Record<Exclude<Locale, 'ko'>, string> = {
  en: 'Looking for a free restroom in Korea? Check public restroom locations and access details before visiting.',
  ja: '韓国で無料トイレをお探しですか？公衆トイレの場所と利用情報を確認できます。',
  'zh-CN': '在韩国找免费厕所？查看公共厕所的位置和开放信息，出发前请确认。',
  'zh-TW': '在韓國找免費廁所？查看公共廁所位置與開放資訊，前往前請確認。',
  'zh-HK': '在韓國找免費公廁？查看公廁位置與開放資訊，前往前請確認。',
}

export function freeRestroomSearchPrompt(locale: Locale) {
  return locale === 'ko' ? '' : freeRestroomPrompt[locale]
}
