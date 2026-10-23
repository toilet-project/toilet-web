type Coordinates = { latitude: number; longitude: number }

export function calculateDistanceInMeters(from: Coordinates, to: Coordinates): number {
  const earthRadiusInMeters = 6_371_000
  const toRadians = (degree: number) => degree * (Math.PI / 180)
  const latitudeDelta = toRadians(to.latitude - from.latitude)
  const longitudeDelta = toRadians(to.longitude - from.longitude)
  const latitudeFrom = toRadians(from.latitude)
  const latitudeTo = toRadians(to.latitude)
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitudeFrom) * Math.cos(latitudeTo) * Math.sin(longitudeDelta / 2) ** 2

  return 2 * earthRadiusInMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

// Calculate each distance once for both sorting and display; preserve stable ties.
export function orderMapListByDistance<T extends Coordinates>(groups: readonly T[], reference: Coordinates | null) {
  const entries = groups.map(group => ({ group,
    distanceInMeters: reference ? calculateDistanceInMeters(reference, group) : null }))
  return reference ? entries.sort((left, right) => left.distanceInMeters! - right.distanceInMeters!) : entries
}
