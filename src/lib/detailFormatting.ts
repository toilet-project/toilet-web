import type { Locale } from '../i18n/locale'
import type { NormalizedOpeningHours, ToiletDetailResponse } from '../api/toilets'

export type CountItem = { label: string; count: number }

export function visibleCounts(items: CountItem[]) {
  return items.filter(({ count }) => count > 0)
}

export function hasValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// Only normalized, structured opening-hour values are translated. Free-form source
// text remains in its original language for Asian locales, never as a verified translation.
const openingLabels = {
  ko: { reviewing: '운영시간 정보 없음', pending: '운영시간 정보 없음', allDay: '24시간 운영', closed: '미개방', irregular: '불규칙 운영', always: '상시 운영', holidayOpen: '공휴일 운영', holidayClosed: '공휴일 휴무', dayClosed: '휴무', nextDay: ' 익일', daily: '매일', weekdays: '평일', weekends: '주말', days: ['월', '화', '수', '목', '금', '토', '일'], unavailable: '확인할 수 없음' },
  en: { reviewing: 'Opening hours under review', pending: 'Opening hours unavailable', allDay: 'Open 24 hours', closed: 'Closed', irregular: 'Irregular hours', always: 'Open daily', holidayOpen: 'Open on public holidays', holidayClosed: 'Closed on public holidays', dayClosed: 'closed', nextDay: ' next day', daily: 'Daily', weekdays: 'Weekdays', weekends: 'Weekends', days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], unavailable: 'Unavailable' },
  ja: { reviewing: '利用時間を確認中', pending: '利用時間の情報なし', allDay: '24時間利用可', closed: '利用不可', irregular: '不定期', always: '毎日利用可', holidayOpen: '祝日も利用可', holidayClosed: '祝日は利用不可', dayClosed: '利用不可', nextDay: ' 翌日', daily: '毎日', weekdays: '平日', weekends: '週末', days: ['月', '火', '水', '木', '金', '土', '日'], unavailable: '確認できません' },
  'zh-CN': { reviewing: '开放时间待确认', pending: '暂无开放时间信息', allDay: '24小时开放', closed: '未开放', irregular: '开放时间不固定', always: '每天开放', holidayOpen: '节假日开放', holidayClosed: '节假日不开放', dayClosed: '不开放', nextDay: ' 次日', daily: '每天', weekdays: '工作日', weekends: '周末', days: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'], unavailable: '无法确认' },
  'zh-TW': { reviewing: '開放時間待確認', pending: '沒有開放時間資訊', allDay: '24小時開放', closed: '未開放', irregular: '開放時間不固定', always: '每天開放', holidayOpen: '國定假日開放', holidayClosed: '國定假日不開放', dayClosed: '不開放', nextDay: ' 隔日', daily: '每天', weekdays: '平日', weekends: '週末', days: ['週一', '週二', '週三', '週四', '週五', '週六', '週日'], unavailable: '無法確認' },
  'zh-HK': { reviewing: '開放時間待確認', pending: '暫無開放時間資料', allDay: '24小時開放', closed: '未開放', irregular: '開放時間不固定', always: '每日開放', holidayOpen: '公眾假期開放', holidayClosed: '公眾假期休息', dayClosed: '不開放', nextDay: ' 翌日', daily: '每日', weekdays: '平日', weekends: '週末', days: ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'], unavailable: '無法確認' },
} satisfies Record<Locale, { reviewing: string; pending: string; allDay: string; closed: string; irregular: string; always: string; holidayOpen: string; holidayClosed: string; dayClosed: string; nextDay: string; daily: string; weekdays: string; weekends: string; days: string[]; unavailable: string }>

export function formatOpenTime(toilet: ToiletDetailResponse, locale: Locale = 'ko') {
  const normalized = toilet.normalizedOpeningHours
  if (normalized && !normalized.sourceChanged && (normalized.status === 'PARSED' || normalized.status === 'CONFIRMED')) {
    const formatted = formatNormalizedOpeningHours(normalized, locale)
    if (formatted) return formatted
  }

  const raw = [toilet.openTime, toilet.openTimeDetail].filter(hasValue).join(' · ')
  if (locale === 'en') return raw ? openingLabels.en.reviewing : openingLabels.en.pending
  return raw || openingLabels[locale].pending
}

function formatNormalizedOpeningHours(value: NormalizedOpeningHours, locale: Locale) {
  const labels = openingLabels[locale]
  let primary = ''
  if (value.open24h === true) primary = labels.allDay
  else if (value.openingPolicy === 'CLOSED') primary = labels.closed
  else if (value.openingPolicy === 'IRREGULAR') primary = labels.irregular
  else if (value.openingPolicy === 'SCHEDULED') primary = formatSchedules(value.schedules, locale)
  else if (value.openingPolicy === 'ALWAYS') primary = labels.always
  if (!primary) return ''

  const holiday = value.holidayPolicy === 'OPEN' ? labels.holidayOpen
    : value.holidayPolicy === 'CLOSED' ? labels.holidayClosed : ''
  return holiday ? `${primary} · ${holiday}` : primary
}

function formatSchedules(schedules: NormalizedOpeningHours['schedules'], locale: Locale) {
  const labels = openingLabels[locale]
  const groups = new Map<string, { days: number[]; start: string | null; end: string | null; crossesMidnight: boolean; closed: boolean }>()
  for (const schedule of [...schedules].sort((left, right) => left.dayOfWeek - right.dayOfWeek || left.slotIndex - right.slotIndex)) {
    const key = `${schedule.closed}:${schedule.startTime ?? ''}:${schedule.endTime ?? ''}:${schedule.crossesMidnight}`
    const group = groups.get(key) ?? { days: [], start: schedule.startTime, end: schedule.endTime, crossesMidnight: schedule.crossesMidnight, closed: schedule.closed }
    if (!group.days.includes(schedule.dayOfWeek)) group.days.push(schedule.dayOfWeek)
    groups.set(key, group)
  }

  return [...groups.values()].map(group => {
    const days = formatDays(group.days, locale)
    if (group.closed) return `${days} ${labels.dayClosed}`
    if (!group.start || !group.end) return ''
    const nextDay = group.crossesMidnight ? labels.nextDay : ''
    return `${days} ${group.start}–${group.end}${nextDay}`
  }).filter(Boolean).join(' · ')
}

function formatDays(days: number[], locale: Locale) {
  const labels = openingLabels[locale]
  const unique = [...new Set(days)].filter(day => day >= 1 && day <= 7).sort((left, right) => left - right)
  const key = unique.join(',')
  if (key === '1,2,3,4,5,6,7') return labels.daily
  if (key === '1,2,3,4,5') return labels.weekdays
  if (key === '6,7') return labels.weekends
  return unique.map(day => labels.days[day - 1]).join(locale === 'en' ? ', ' : '·')
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
  if (month < 1 || month > 12) return locale === 'ko' ? `${matched[1]}년` : `${matched[1]}年`
  return locale === 'ko' ? `${matched[1]}년 ${month}월` : `${matched[1]}年${month}月`
}

export function formatLastUpdatedAt(updatedAt: Date | null, locale: Locale = 'ko') {
  if (!updatedAt) return openingLabels[locale].unavailable
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale === 'ko' ? 'ko-KR' : locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(updatedAt)
}

const FACILITY_LOCATION_TYPES = {
  '장애인화장실': 'accessible', '장애인 화장실': 'accessible',
  '남자화장실': 'men', '남자 화장실': 'men', '남성화장실': 'men', '남성 화장실': 'men',
  '여자화장실': 'women', '여자 화장실': 'women', '여성화장실': 'women', '여성 화장실': 'women',
} as const
const facilityLocationLabels = {
  en: { accessible: 'Accessible', men: 'Men', women: 'Women' },
  ja: { accessible: 'バリアフリー', men: '男性用', women: '女性用' },
  'zh-CN': { accessible: '无障碍', men: '男用', women: '女用' },
  'zh-TW': { accessible: '無障礙', men: '男用', women: '女用' },
  'zh-HK': { accessible: '無障礙', men: '男用', women: '女用' },
} satisfies Record<Exclude<Locale, 'ko'>, Record<(typeof FACILITY_LOCATION_TYPES)[keyof typeof FACILITY_LOCATION_TYPES], string>>

export function formatFacilityLocation(location: string, locale: Locale = 'ko') {
  const parts = location.split(/\s*(?:\+|\/)\s*/).filter(Boolean)
  if (locale === 'ko') return parts.join(' / ')
  return parts.map(part => {
    const kind = Object.hasOwn(FACILITY_LOCATION_TYPES, part) ? FACILITY_LOCATION_TYPES[part as keyof typeof FACILITY_LOCATION_TYPES] : null
    return kind ? facilityLocationLabels[locale][kind] : part
  }).join(' / ')
}
