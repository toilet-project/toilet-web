import type { ToiletDetailResponse } from '../api/toilets'
import type { Locale } from '../i18n/locale'
import { message } from '../i18n/messages'
import { fallbackToiletDisplayLanguages } from '../i18n/toiletTranslations'
import { hasVisibleKoreanOriginal } from '../lib/detailFormatting'

export function OriginalSourceBadge({ toilet, locale }: { toilet: ToiletDetailResponse | null; locale: Locale }) {
  if (!toilet) return null
  const fallbacks = fallbackToiletDisplayLanguages(toilet, locale)
  const korean = hasVisibleKoreanOriginal(toilet, locale)
  if (!fallbacks.length && !korean) return null
  return <>
    {fallbacks.map(source => <small key={source} className="source-language-badge">{message(locale, source === 'zh-CN' ? 'detail.simplifiedFallback' : 'detail.englishFallback')}</small>)}
    {korean && <small className="source-language-badge">{message(locale, 'detail.originalKorean')}</small>}
  </>
}
