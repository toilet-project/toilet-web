import type { ToiletDetailResponse } from '../api/toilets'
import type { Locale } from '../i18n/locale'
import { message } from '../i18n/messages'
import { localizeToiletDetail } from '../i18n/toiletTranslations'
import { localizedPublicPath } from '../i18n/routes'
import { getDisplayAddress } from './address'
import { regionLabel } from './toiletRoute'
import { districtForToilet, getProvince, regionName, localizedRegionPath } from './regions'
import { visibleCounts, hasValue, formatOpenTime, formatPhoneNumber, formatInstallationDate, formatFacilityLocation } from './detailFormatting'

export type DetailPresentation = ReturnType<typeof detailPresentation>

// Public facility content only. No chrome, deployment ID, authentication,
// reviews, visitor location, or browser state participates in this model.
export function detailPresentation(toilet: ToiletDetailResponse, locale: Locale) {
  const t = (key: Parameters<typeof message>[1]) => message(locale, key)
  const display = localizeToiletDetail(toilet, locale)
  const district = display.longitude != null && display.latitude != null ? districtForToilet(display.id, display.longitude, display.latitude) : null
  const province = district ? getProvince(district.provinceCode) : null
  const region = district && province ? `${regionName(province, locale)} ${regionName(district, locale)}` : regionLabel(display.region)
  const groups = [
    { title: t('detail.male'), items: visibleCounts([
      { label: t('detail.toilets'), count: display.maleToiletCount },
      { label: t('detail.urinals'), count: display.maleUrinalCount },
      { label: t('detail.accessibleToilets'), count: display.maleDisabledToiletCount },
      { label: t('detail.accessibleUrinals'), count: display.maleDisabledUrinalCount },
      { label: t('detail.childToilets'), count: display.maleChildToiletCount },
      { label: t('detail.childUrinals'), count: display.maleChildUrinalCount },
    ]) },
    { title: t('detail.female'), items: visibleCounts([
      { label: t('detail.toilets'), count: display.femaleToiletCount },
      { label: t('detail.accessibleToilets'), count: display.femaleDisabledToiletCount },
      { label: t('detail.childToilets'), count: display.femaleChildToiletCount },
    ]) },
  ].filter(group => group.items.length)
  const facility = (label: string, available: boolean, rawLocation = '') => ({ label, available,
    location: available && hasValue(rawLocation) ? formatFacilityLocation(rawLocation, locale) : null })
  return {
    title: t('detail.title'), copy: t('detail.copy'), countSuffix: locale === 'ko' ? '대' : '',
    address: { label: t('detail.address'), value: getDisplayAddress(display.roadAddress, display.jibunAddress) },
    region: { label: t('detail.region'), value: region,
      href: district && province ? localizedPublicPath(localizedRegionPath(locale, district.provinceCode, district.code), locale)! : null },
    opening: { label: t('detail.openingDetails'), value: formatOpenTime(display, locale) },
    installed: hasValue(display.installationDate) ? { label: t('detail.installed'), value: formatInstallationDate(display.installationDate, locale) } : null,
    capacity: { title: t('detail.capacity'), groups },
    safety: { title: t('detail.safety'), available: t('detail.available'), unavailable: t('detail.unavailable'), location: t('detail.location'),
      items: [facility(t('detail.bell'), display.hasEmergencyBell === 'Y', display.emergencyBellLocation),
        facility('CCTV', display.hasCctv === 'Y'), facility(t('detail.diaper'), display.hasDiaperTable === 'Y', display.diaperTableLocation)] },
    other: [
      ...(hasValue(display.agencyName) ? [{ label: t('detail.agency'), value: display.agencyName }] : []),
      ...(hasValue(display.phoneNumber) ? [{ label: t('detail.phone'), value: formatPhoneNumber(display.phoneNumber) }] : []),
      ...(hasValue(display.dataBaseDate) ? [{ label: t('detail.dataDate'), value: display.dataBaseDate }] : []),
    ],
  }
}
