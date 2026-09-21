import type { ToiletDetailResponse } from '../api/toilets'
import { districtAt, regionPath } from './regions.ts'
import { toiletPath } from './toiletRoute.ts'

const initial = ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h']
const vowel = ['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i']
const final = ['','k','k','k','n','n','n','t','l','k','m','p','l','l','p','l','m','p','p','t','t','ng','t','t','k','t','p','t']

/** Stable ASCII slug for Korean source names; the numeric ID remains the true identity. */
export function facilitySlug(name: string) {
  const romanized = Array.from(name.normalize('NFC')).map(character => {
    const syllable = character.charCodeAt(0) - 0xac00
    if (syllable < 0 || syllable >= 11172) return character
    const first = Math.floor(syllable / 588), middle = Math.floor((syllable % 588) / 28), last = syllable % 28
    return initial[first] + vowel[middle] + final[last]
  }).join('')
  return romanized.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72).replace(/-$/, '') || 'restroom'
}

export function regionToiletPath(detail: Pick<ToiletDetailResponse, 'id' | 'name' | 'latitude' | 'longitude'>) {
  if (detail.latitude == null || detail.longitude == null) return toiletPath(detail.id)
  const district = districtAt(detail.longitude, detail.latitude)
  if (!district) return toiletPath(detail.id)
  return `${regionPath(district.provinceCode, district.code)}/toilet/${detail.id}-${facilitySlug(detail.name)}`
}

export function parseRegionToiletSegment(segment: string) {
  const match = /^([1-9]\d*)-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(segment)
  if (!match) return null
  const id = Number(match[1])
  return Number.isSafeInteger(id) ? id : null
}
