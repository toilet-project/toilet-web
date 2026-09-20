import type { Locale } from '../i18n/locale'
import type { NormalizedOpeningHours, ToiletDetailResponse } from '../api/toilets'

export type CountItem = { label: string; count: number }

export function visibleCounts(items: CountItem[]) {
  return items.filter(({ count }) => count > 0)
}

export function hasValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function formatOpenTime(toilet: ToiletDetailResponse, locale: Locale = 'ko') {
  const normalized = toilet.normalizedOpeningHours
  if (normalized && !normalized.sourceChanged && (normalized.status === 'PARSED' || normalized.status === 'CONFIRMED')) {
    const formatted = formatNormalizedOpeningHours(normalized, locale)
    if (formatted) return formatted
  }

  const raw = [toilet.openTime, toilet.openTimeDetail].filter(hasValue).join(' · ')
  if (locale === 'en') return raw ? 'Opening hours under review' : 'Opening hours unavailable'
  return raw || '운영시간 정보 없음'
}

function formatNormalizedOpeningHours(value: NormalizedOpeningHours, locale: Locale) {
  let primary = ''
  if (value.open24h === true) primary = locale === 'en' ? 'Open 24 hours' : '24시간 운영'
  else if (value.openingPolicy === 'CLOSED') primary = locale === 'en' ? 'Closed' : '미개방'
  else if (value.openingPolicy === 'IRREGULAR') primary = locale === 'en' ? 'Irregular hours' : '불규칙 운영'
  else if (value.openingPolicy === 'SCHEDULED') primary = formatSchedules(value.schedules, locale)
  else if (value.openingPolicy === 'ALWAYS') primary = locale === 'en' ? 'Open daily' : '상시 운영'
  if (!primary) return ''

  const holiday = value.holidayPolicy === 'OPEN'
    ? (locale === 'en' ? 'Open on public holidays' : '공휴일 운영')
    : value.holidayPolicy === 'CLOSED'
      ? (locale === 'en' ? 'Closed on public holidays' : '공휴일 휴무')
      : ''
  return holiday ? `${primary} · ${holiday}` : primary
}

function formatSchedules(schedules: NormalizedOpeningHours['schedules'], locale: Locale) {
  const groups = new Map<string, { days: number[]; start: string | null; end: string | null; crossesMidnight: boolean; closed: boolean }>()
  for (const schedule of [...schedules].sort((left, right) => left.dayOfWeek - right.dayOfWeek || left.slotIndex - right.slotIndex)) {
    const key = `${schedule.closed}:${schedule.startTime ?? ''}:${schedule.endTime ?? ''}:${schedule.crossesMidnight}`
    const group = groups.get(key) ?? { days: [], start: schedule.startTime, end: schedule.endTime, crossesMidnight: schedule.crossesMidnight, closed: schedule.closed }
    if (!group.days.includes(schedule.dayOfWeek)) group.days.push(schedule.dayOfWeek)
    groups.set(key, group)
  }

  return [...groups.values()].map(group => {
    const days = formatDays(group.days, locale)
    if (group.closed) return locale === 'en' ? `${days} closed` : `${days} 휴무`
    if (!group.start || !group.end) return ''
    const nextDay = group.crossesMidnight ? (locale === 'en' ? ' next day' : ' 익일') : ''
    return `${days} ${group.start}–${group.end}${nextDay}`
  }).filter(Boolean).join(' · ')
}

function formatDays(days: number[], locale: Locale) {
  const unique = [...new Set(days)].filter(day => day >= 1 && day <= 7).sort((left, right) => left - right)
  const key = unique.join(',')
  if (key === '1,2,3,4,5,6,7') return locale === 'en' ? 'Daily' : '매일'
  if (key === '1,2,3,4,5') return locale === 'en' ? 'Weekdays' : '평일'
  if (key === '6,7') return locale === 'en' ? 'Weekends' : '주말'
  const labels = locale === 'en'
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['월', '화', '수', '목', '금', '토', '일']
  return unique.map(day => labels[day - 1]).join(locale === 'en' ? ', ' : '·')
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
