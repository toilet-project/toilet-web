import type { Locale } from '../i18n/locale.ts'
import { message } from '../i18n/messages.ts'

export function reportReadErrorMessage(reason: unknown, locale: Locale = 'ko'): string {
  if (reason instanceof TypeError) return message(locale, 'report.networkError')
  if (reason instanceof Error && reason.message === '로그인이 필요합니다.') return message(locale, 'auth.required')
  return message(locale, 'report.loadFailed')
}
