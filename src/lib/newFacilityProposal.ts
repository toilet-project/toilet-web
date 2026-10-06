import type { NewFacilityInfo } from '../api/quickReports'

export type FacilityForm = Record<keyof NewFacilityInfo, string>
export const emptyFacilityForm: FacilityForm = { toiletType: '', openTime: '', openTimeDetail: '', agencyName: '', phoneNumber: '',
  emergencyBell: '', cctv: '', diaperTable: '', maleDisabledToiletCount: '', femaleDisabledToiletCount: '' }

export function facilityProposal(value: FacilityForm): NewFacilityInfo {
  const optional = (key: keyof FacilityForm) => value[key].trim() || null
  const flag = (key: keyof FacilityForm) => value[key] === '' ? null : value[key] === 'true'
  const count = (key: keyof FacilityForm) => value[key] === '' ? null : Number(value[key])
  return { toiletType: optional('toiletType'), openTime: optional('openTime'), openTimeDetail: optional('openTimeDetail'),
    agencyName: optional('agencyName'), phoneNumber: optional('phoneNumber'), emergencyBell: flag('emergencyBell'),
    cctv: flag('cctv'), diaperTable: flag('diaperTable'), maleDisabledToiletCount: count('maleDisabledToiletCount'), femaleDisabledToiletCount: count('femaleDisabledToiletCount') }
}
