import type { ToiletDetailResponse } from '../api/toilets'
import type { Locale } from '../i18n/locale'
import { message } from '../i18n/messages'
import { hasVisibleKoreanOriginal } from '../lib/detailFormatting'

export function OriginalSourceBadge({ toilet, locale }: { toilet: ToiletDetailResponse | null; locale: Locale }) {
  if (!toilet || !hasVisibleKoreanOriginal(toilet, locale)) return null
  return <small className="source-language-badge">{message(locale, 'detail.originalKorean')}</small>
}
