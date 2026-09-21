import type { Locale } from './locale.ts'
import { message, type MessageKey } from './messages.ts'

export function accountDate(value: string, locale: Locale, dateOnly = false): string {
  // The service's zone-less timestamps are Korea time, independent of the visitor's timezone.
  const source = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+09:00`
    : /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}+09:00`
  const date = new Date(source)
  if (!Number.isFinite(date.getTime())) return '—'
  const options = { timeZone: 'Asia/Seoul' }
  const language = locale === 'en' ? 'en-GB' : locale === 'ko' ? 'ko-KR' : locale
  return dateOnly ? date.toLocaleDateString(language, options)
    : date.toLocaleString(language, options)
}

const errorKeys: Readonly<Record<string, MessageKey>> = {
  '인증 시간이 만료됐어요. 다시 소셜 로그인한 뒤 계정 상태를 확인해 주세요.': 'account.sessionExpired',
  '탈퇴·복구 기능 점검 중입니다. 개인정보 문의로 요청해 주세요.': 'account.lifecycleUnavailable',
  '탈퇴 처리 결과를 확인하지 못했어요. 다시 로그인하거나 개인정보 문의로 확인해 주세요.': 'account.withdrawUnknown',
  '요청 결과를 확인하지 못했어요. 다시 소셜 로그인한 뒤 계정 상태를 확인해 주세요.': 'account.recoveryUnknown',
  '닉네임은 공백만 제외한 2~30자로 입력해 주세요. 제어 문자는 사용할 수 없어요.': 'account.nicknameInvalid',
}
/** Translate only known fixed error copy; never expose arbitrary backend text in English. */
export function accountError(reason: unknown, locale: Locale, fallback: MessageKey) {
  if (locale === 'ko' && reason instanceof Error) return reason.message
  const key = reason instanceof Error && Object.hasOwn(errorKeys, reason.message) ? errorKeys[reason.message] : fallback
  return message(locale, key)
}

const titles: Readonly<Record<string, string>> = {
  SERVICE_TERMS: 'Geupddong Terms of Service', PRIVACY_COLLECTION: 'Collection and Use of Personal Information',
  AGE_14_PLUS: 'Confirmation of Age 14 or Older', PRIVACY_POLICY: 'Privacy Policy', LOCATION_NOTICE: 'Location Information Notice',
}
export function policyTitle(locale: Locale, key: string, original: string) {
  return locale === 'en' && Object.hasOwn(titles, key) ? titles[key] : original
}

/** Only the verified current document version is translated. Archives/unknown versions stay exact. */
export function policyDisplayPath(path: string, locale: Locale, version?: string): string {
  if (locale !== 'en' || version !== '1.0') return path
  if (!/^\/policies\/(?:terms|privacy|location|all)(?:#(?:age|collection|analytics|profile-photo-overseas|erasure-records|terms|privacy|location))?$/.test(path)) return path
  return `/en${path}`
}
