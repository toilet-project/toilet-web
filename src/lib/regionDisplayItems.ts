import type { ToiletMapItemResponse } from '../api/toilets'
import type { Locale } from '../i18n/locale'
import { localizeToiletMapItem } from '../i18n/toiletTranslations.ts'

/** Send only the selected language and the fields the district map actually renders. */
export function regionDisplayItems(toilets: ToiletMapItemResponse[], locale: Locale): ToiletMapItemResponse[] {
  return toilets.map(toilet => {
    const display = localizeToiletMapItem(toilet, locale)
    return {
      id: display.id,
      name: display.name,
      toiletType: display.toiletType,
      latitude: display.latitude,
      longitude: display.longitude,
      displayGroupId: display.displayGroupId,
      displayGroupName: display.displayGroupName,
    }
  })
}
