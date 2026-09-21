import type { ToiletMapItemResponse } from '../api/toilets'
import type { Locale } from '../i18n/locale'

export type ToiletMapItem = ToiletMapItemResponse
export type MapPoint = { id?: number; latitude: number; longitude: number; count: number; name?: string; toiletType?: string; toilets?: ToiletMapItem[]; displayGroupName?: string }

export function coordinateGroupCategory(toilets: ToiletMapItem[]): string {
  return [...new Set(toilets.map(toilet => toilet.toiletType?.trim()).filter(Boolean))].join(' · ') || '화장실'
}

function additionalPlaces(count: number, locale: Locale): string {
  switch (locale) {
    case 'ko': return `외 ${count}개 장소`
    case 'en': return `and ${count} more ${count === 1 ? 'place' : 'places'}`
    case 'ja': return `ほか${count}か所`
    case 'zh-CN': return `另有${count}处地点`
    case 'zh-TW': return `另有${count}處地點`
    case 'zh-HK': return `另有${count}個地點`
  }
}

export function groupToiletsByCoordinate(toilets: ToiletMapItem[], locale: Locale = 'ko'): MapPoint[] {
  const groups = new Map<string, ToiletMapItem[]>()
  for (const toilet of toilets) {
    const key = `${toilet.latitude}:${toilet.longitude}`
    const current = groups.get(key)
    if (current) current.push(toilet)
    else groups.set(key, [toilet])
  }
  return [...groups.values()].map((items) => {
    const [toilet] = items
    const namedGroups = new Map<number, string>()
    let ungroupedCount = 0
    items.forEach((item) => {
      const displayName = item.displayGroupName?.trim()
      if (item.displayGroupId && displayName) namedGroups.set(item.displayGroupId, displayName)
      else ungroupedCount += 1
    })
    const displayGroupNames = [...namedGroups.values()]
    const additionalPlaceCount = Math.max(0, displayGroupNames.length - 1) + ungroupedCount
    const displayGroupName = displayGroupNames.length
      ? `${displayGroupNames[0]}${additionalPlaceCount ? ` ${additionalPlaces(additionalPlaceCount, locale)}` : ''}`
      : undefined
    return items.length === 1
      ? { ...toilet, displayGroupName: toilet.displayGroupName || undefined, count: 1 }
      : { latitude: toilet.latitude, longitude: toilet.longitude, count: items.length, toilets: items, displayGroupName }
  })
}

// Desktop and mobile must retain the same category as the API detail response.
export function representativeToilet(group: MapPoint): ToiletMapItem {
  return group.toilets?.[0] ?? {
    id: group.id ?? 0,
    name: group.name ?? '',
    toiletType: group.toiletType,
    latitude: group.latitude,
    longitude: group.longitude,
  }
}
