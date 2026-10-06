import type { NewFacilityInfo } from '../api/quickReports'

export type FacilityTextField = Exclude<keyof NewFacilityInfo, 'openingHours'>
export type FacilityForm = Record<FacilityTextField, string>
export const emptyFacilityForm: FacilityForm = { toiletType: '', openTime: '', openTimeDetail: '', agencyName: '', phoneNumber: '',
  emergencyBell: '', cctv: '', diaperTable: '', maleDisabledToiletCount: '', femaleDisabledToiletCount: '' }

export function facilityProposal(value: FacilityForm): NewFacilityInfo {
  const optional = (key: FacilityTextField) => value[key].trim() || null
  const flag = (key: FacilityTextField) => value[key] === '' ? null : value[key] === 'true'
  const count = (key: FacilityTextField) => value[key] === '' ? null : Number(value[key])
  // Keep the reporter's wording as evidence; an administrator confirms the actual hours policy.
  return { openingHours: null, toiletType: optional('toiletType'), openTime: optional('openTime'), openTimeDetail: optional('openTimeDetail'),
    agencyName: optional('agencyName'), phoneNumber: optional('phoneNumber'), emergencyBell: flag('emergencyBell'),
    cctv: flag('cctv'), diaperTable: flag('diaperTable'), maleDisabledToiletCount: count('maleDisabledToiletCount'), femaleDisabledToiletCount: count('femaleDisabledToiletCount') }
}
