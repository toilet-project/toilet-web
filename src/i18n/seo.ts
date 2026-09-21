import type { ToiletDetailResponse } from '../api/toilets.ts'
import { placeData, SITE_ORIGIN } from '../lib/seo.ts'
import { localizeToiletDetail, toiletTranslation } from './toiletTranslations.ts'

export const englishHomeMetadata = {
  title: 'Geupddong | Find public restrooms in Korea',
  description: 'A public restroom map for travelers in Korea. Find nearby restrooms and check locations, opening hours and facilities during your trip.',
} as const

export function englishHomeData() {
  return {
    '@context': 'https://schema.org',
    '@graph': [{
      '@type': 'WebSite', '@id': `${SITE_ORIGIN}/#website`, url: `${SITE_ORIGIN}/en`,
      name: 'Geupddong', inLanguage: 'en-US', description: englishHomeMetadata.description,
    }, {
      '@type': 'WebApplication', '@id': `${SITE_ORIGIN}/#web-application`, url: `${SITE_ORIGIN}/en`,
      name: 'Geupddong', applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web',
      inLanguage: 'en-US', description: englishHomeMetadata.description,
      featureList: ['Find nearby public restrooms in Korea', 'Search places on the map', 'Check restroom opening hours and facilities'],
    }],
  }
}

export function englishToiletMetadata(detail: Pick<ToiletDetailResponse, 'name' | 'translations'>) {
  const name = (toiletTranslation(detail, 'en')?.name ?? detail.name).trim()
  return {
    title: name ? `${name} — Restroom in Korea` : 'Restroom locations and facilities in Korea',
    description: name ? `Visiting Korea? Check the location, opening hours and facilities of ${name}. Restroom names and addresses are shown in their original language.`
      : 'Find restroom locations, opening hours and facilities for your trip in Korea.',
  }
}

export function englishPlaceData(detail: ToiletDetailResponse) {
  // One physical place keeps its stable identity and source name across languages.
  const display = localizeToiletDetail(detail, 'en')
  return { ...placeData(display), url: `${SITE_ORIGIN}/en/toilet/${detail.id}`, description: englishToiletMetadata(detail).description }
}
