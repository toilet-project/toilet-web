import type { NewFacilityInfo, ReportOpeningHours } from '../api/quickReports'

export type HoursForm = { policy: '' | ReportOpeningHours['openingPolicy']; holidayPolicy: ReportOpeningHours['holidayPolicy']; schedules: {dayOfWeek: number; startTime: string; endTime: string; closed: boolean}[] }
export type FacilityTextField = Exclude<keyof NewFacilityInfo, 'openingHours'>
export type FacilityForm = Record<FacilityTextField, string> & { openingHours: HoursForm }
export const emptyFacilityForm: FacilityForm = { toiletType: '', openTime: '', openTimeDetail: '', agencyName: '', phoneNumber: '',
  emergencyBell: '', cctv: '', diaperTable: '', maleDisabledToiletCount: '', femaleDisabledToiletCount: '', openingHours: {policy: '', holidayPolicy: 'UNKNOWN', schedules: []} }

export function hoursProposal(value: HoursForm): ReportOpeningHours | null {
  if (!value.policy) return null
  if (value.policy === 'SCHEDULED' && !value.schedules.length) throw new Error('invalidHours')
  const counts = new Map<number, number>()
  return { openingPolicy: value.policy, open24h: value.policy === 'ALWAYS', holidayPolicy: value.holidayPolicy,
    schedules: value.policy === 'SCHEDULED' ? value.schedules.map(row => {
      const slotIndex = counts.get(row.dayOfWeek) || 0; counts.set(row.dayOfWeek, slotIndex + 1)
      if (row.dayOfWeek < 1 || row.dayOfWeek > 7 || slotIndex > 20 || (!row.closed && (!/^\d{2}:\d{2}$/.test(row.startTime) || !/^\d{2}:\d{2}$/.test(row.endTime) || row.startTime === row.endTime))) throw new Error('invalidHours')
      return {...row, slotIndex, startTime: row.closed ? null : row.startTime, endTime: row.closed ? null : row.endTime, crossesMidnight: !row.closed && row.endTime < row.startTime}
    }) : [] }
}

export function facilityProposal(value: FacilityForm): NewFacilityInfo {
  const optional = (key: FacilityTextField) => value[key].trim() || null
  const flag = (key: FacilityTextField) => value[key] === '' ? null : value[key] === 'true'
  const count = (key: FacilityTextField) => value[key] === '' ? null : Number(value[key])
  const openingHours = hoursProposal(value.openingHours)
  const summary = {ALWAYS:'24시간', SCHEDULED:'요일별 운영', IRREGULAR:'불규칙 운영', CLOSED:'운영 중단'}
  return { openingHours, toiletType: optional('toiletType'), openTime: openingHours ? summary[openingHours.openingPolicy] : optional('openTime'), openTimeDetail: optional('openTimeDetail'),
    agencyName: optional('agencyName'), phoneNumber: optional('phoneNumber'), emergencyBell: flag('emergencyBell'),
    cctv: flag('cctv'), diaperTable: flag('diaperTable'), maleDisabledToiletCount: count('maleDisabledToiletCount'), femaleDisabledToiletCount: count('femaleDisabledToiletCount') }
}
