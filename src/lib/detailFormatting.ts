import type { Locale } from '../i18n/locale'
import type { ToiletDetailResponse } from '../api/toilets'

export type CountItem = { label: string; count: number }

export function visibleCounts(items: CountItem[]) {
  return items.filter(({ count }) => count > 0)
}

export function hasValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function formatOpenTime(toilet: ToiletDetailResponse, locale: Locale = 'ko') {
  return [toilet.openTime, toilet.openTimeDetail].filter(hasValue).join(' · ') || (locale === 'en' ? 'Opening hours unavailable' : '운영시간 정보 없음')
}

export function formatPhoneNumber(phoneNumber: string) {
  const digits = phoneNumber.replace(/\D/g, '')
  if (/^02\d{7,8}$/.test(digits)) return digits.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3')
  if (/^0\d{9,10}$/.test(digits)) return digits.replace(/^(0\d{2})(\d{3,4})(\d{4})$/, '$1-$2-$3')
  return phoneNumber
}

export function formatInstallationDate(installationDate: string, locale: Locale = 'ko') {
  const digits = installationDate.replace(/\D/g, '')
  const matched = digits.match(/^(\d{4})(\d{1,2})$/)
  if (!matched) return installationDate

  const month = Number(matched[2])
  if (locale === 'en') return month >= 1 && month <= 12 ? `${matched[1]}-${String(month).padStart(2, '0')}` : matched[1]
  if (month < 1 || month > 12) return `${matched[1]}년`
  return `${matched[1]}년 ${month}월`
}

export function formatLastUpdatedAt(updatedAt: Date | null, locale: Locale = 'ko') {
  if (!updatedAt) return locale === 'en' ? 'Unavailable' : '확인할 수 없음'
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(updatedAt)
}

const ENGLISH_FACILITY_LOCATION_LABELS: Record<string, string> = {
  '장애인화장실': 'Accessible',
  '장애인 화장실': 'Accessible',
  '남자화장실': 'Men',
  '남자 화장실': 'Men',
  '남성화장실': 'Men',
  '남성 화장실': 'Men',
  '여자화장실': 'Women',
  '여자 화장실': 'Women',
  '여성화장실': 'Women',
  '여성 화장실': 'Women',
}

export function formatFacilityLocation(location: string, locale: Locale = 'ko') {
  const parts = location.split(/\s*(?:\+|\/)\s*/).filter(Boolean)
  if (locale !== 'en') return parts.join(' / ')
  return parts.map(part => ENGLISH_FACILITY_LOCATION_LABELS[part] ?? part).join(' / ')
}
