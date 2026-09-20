import type { PlaceSearchResult } from '../lib/placeSearchTypes'

type EnglishPlaceSearchResponse = {
  results?: Array<{
    id: string
    name: string
    address?: string
    latitude: number
    longitude: number
  }>
}

export async function searchEnglishPlaces(keyword: string, signal?: AbortSignal): Promise<PlaceSearchResult[]> {
  const query = keyword.trim()
  if (query.length < 2) return []

  const response = await fetch('/api/place-search', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale: 'en', query }),
    cache: 'no-store',
    signal,
  })

  if (!response.ok) throw new Error('English place search failed')
  const body = await response.json() as EnglishPlaceSearchResponse
  return (body.results ?? []).filter((place) => (
    place.id
    && place.name
    && Number.isFinite(place.latitude)
    && Number.isFinite(place.longitude)
  )).map((place) => ({
    id: place.id,
    name: place.name,
    address: place.address?.trim() ?? '',
    latitude: place.latitude,
    longitude: place.longitude,
  }))
}
