import type { PlaceSearchResult } from '../lib/placeSearchTypes'
import type { Locale } from '../i18n/locale'

type EnglishPlaceSearchResponse = {
  results?: Array<{
    id: string
    name: string
    address?: string
    category?: string
    categoryCode?: string
    latitude: number
    longitude: number
  }>
}

export async function searchCloudflarePlaces(keyword: string, locale: Locale, signal?: AbortSignal): Promise<PlaceSearchResult[]> {
  const query = keyword.trim()
  if (query.length < 2) return []

  const response = await fetch('/api/place-search', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale, query }),
    cache: 'no-store',
    signal,
  })

  if (!response.ok) throw new Error('Place search failed')
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
    category: place.category?.trim() || 'Place',
    categoryCode: place.categoryCode?.trim() || 'unknown',
    latitude: place.latitude,
    longitude: place.longitude,
  }))
}
