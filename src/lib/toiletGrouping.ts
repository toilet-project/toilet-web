export type ToiletMapItem = { id: number; name: string; toiletType?: string; latitude: number; longitude: number; displayGroupId?: number | null; displayGroupName?: string | null }
export type MapPoint = { id?: number; latitude: number; longitude: number; count: number; name?: string; toiletType?: string; toilets?: ToiletMapItem[]; displayGroupName?: string }

export function coordinateGroupCategory(toilets: ToiletMapItem[]): string {
  return [...new Set(toilets.map(toilet => toilet.toiletType?.trim()).filter(Boolean))].join(' · ') || '화장실'
}

export function groupToiletsByCoordinate(toilets: ToiletMapItem[]): MapPoint[] {
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
      ? `${displayGroupNames[0]}${additionalPlaceCount ? ` 외 ${additionalPlaceCount}개 장소` : ''}`
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
