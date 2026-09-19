import type { ToiletDetailResponse } from '../api/toilets.ts'
import { placeData, SITE_ORIGIN } from '../lib/seo.ts'

export function englishToiletMetadata(detail: Pick<ToiletDetailResponse, 'name'>) {
  const name = detail.name.trim()
  return {
    title: name ? `${name} — Toilet location and facilities` : 'Toilet location and facilities',
    description: name ? `View the location, opening hours and facilities of ${name}. Facility names and addresses are shown in their original language.`
      : 'View the toilet location, opening hours and facilities.',
  }
}

export function englishPlaceData(detail: ToiletDetailResponse) {
  // One physical place keeps its stable identity across languages. Only page URL differs.
  return { ...placeData(detail), url: `${SITE_ORIGIN}/en/toilet/${detail.id}` }
}
