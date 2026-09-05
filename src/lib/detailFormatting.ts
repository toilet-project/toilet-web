import type { ToiletDetailResponse } from '../api/toilets'

export type CountItem = { label: string; count: number }

export function visibleCounts(items: CountItem[]) {
  return items.filter(({ count }) => count > 0)
}

export function hasValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function formatOpenTime(toilet: ToiletDetailResponse) {
  return [toilet.openTime, toilet.openTimeDetail].filter(hasValue).join(' · ') || '운영시간 정보 없음'
}

export function formatPhoneNumber(phoneNumber: string) {
  const digits = phoneNumber.replace(/\D/g, '')
  if (/^02\d{7,8}$/.test(digits)) return digits.replace(/^(02)(\d{3,4})(\d{4})$/, '$1-$2-$3')
  if (/^0\d{9,10}$/.test(digits)) return digits.replace(/^(0\d{2})(\d{3,4})(\d{4})$/, '$1-$2-$3')
  return phoneNumber
}

export function formatInstallationDate(installationDate: string) {
  const digits = installationDate.replace(/\D/g, '')
  const matched = digits.match(/^(\d{4})(\d{1,2})$/)
  if (!matched) return installationDate

  const month = Number(matched[2])
  if (month < 1 || month > 12) return `${matched[1]}년`
  return `${matched[1]}년 ${month}월`
}

export function formatFacilityLocation(location: string) {
  return location.replace(/\s*\+\s*/g, ' / ')
}
