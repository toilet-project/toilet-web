export type ToiletMapItem = { id: number; name: string; toiletType?: string; latitude: number; longitude: number }
export type MapPoint = { id?: number; latitude: number; longitude: number; count: number; name?: string; toiletType?: string; toilets?: ToiletMapItem[] }

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
    return items.length === 1
      ? { ...toilet, count: 1 }
      : { latitude: toilet.latitude, longitude: toilet.longitude, count: items.length, toilets: items }
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
