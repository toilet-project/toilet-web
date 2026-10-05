import { useCallback, useEffect, useRef, useState } from 'react'
import type { Locale } from '../i18n/locale'
import { resultCountBucket, trackEvent } from './analytics'
import { searchPlaces } from './placeSearch'
import { createPlaceSearchRequest } from './placeSearchRequest'
import type { PlaceSearchResult } from './placeSearchTypes'

function initialQuery() {
  const query = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('q')?.trim() ?? ''
  return query.length >= 2 && query.length <= 100 ? query : ''
}

export function usePlaceSearch(locale: Locale) {
  const [placeSearchKeyword, setPlaceSearchKeyword] = useState(initialQuery)
  const [placeSearchResults, setPlaceSearchResults] = useState<PlaceSearchResult[]>([])
  const [placeSearchMessage, setPlaceSearchMessage] = useState<string | null>(null)
  const [isPlaceSearching, setIsPlaceSearching] = useState(false)
  const [activePlaceSearchIndex, setActivePlaceSearchIndex] = useState(-1)
  const [isPlaceSearchFocused, setFocused] = useState(() => Boolean(initialQuery()))
  const requests = useRef(createPlaceSearchRequest())

  const clearResults = useCallback(() => {
    requests.current.cancel()
    setPlaceSearchResults([])
    setPlaceSearchMessage(null)
    setIsPlaceSearching(false)
    setActivePlaceSearchIndex(-1)
  }, [])
  const setIsPlaceSearchFocused = useCallback((focused: boolean) => {
    if (!focused) clearResults()
    setFocused(focused)
  }, [clearResults])
  const handlePlaceSearchChange = useCallback((keyword: string) => {
    clearResults()
    setPlaceSearchKeyword(keyword)
  }, [clearResults])
  const handlePlaceSearchFocus = useCallback(() => {
    handlePlaceSearchChange('')
    setFocused(true)
  }, [handlePlaceSearchChange])
  const selectPlaceSearch = useCallback((place: PlaceSearchResult) => {
    handlePlaceSearchChange(place.name)
    setFocused(false)
  }, [handlePlaceSearchChange])

  useEffect(() => {
    // A locale change must discard results from the previous search provider.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    clearResults()
    const keyword = placeSearchKeyword.trim()
    if (!isPlaceSearchFocused || keyword.length < 2) return
    const gate = requests.current
    const request = gate.begin()
    const timer = window.setTimeout(async () => {
      if (!request.isCurrent()) return
      setIsPlaceSearching(true)
      try {
        const places = await searchPlaces(keyword, locale, request.signal)
        if (!request.isCurrent()) return
        setPlaceSearchResults(places)
        setPlaceSearchMessage(places.length === 0 ? '검색 결과가 없습니다.' : null)
        trackEvent('toilet_search', {
          query_kind: /\d|로|길/.test(keyword) ? 'address' : 'place',
          success: true, result_count_bucket: resultCountBucket(places.length),
        })
      } catch {
        if (!request.isCurrent()) return
        setPlaceSearchMessage('장소를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.')
        trackEvent('toilet_search', { query_kind: 'unknown', success: false, result_count_bucket: '0' })
      } finally {
        if (request.isCurrent()) setIsPlaceSearching(false)
      }
    }, 300)
    return () => { window.clearTimeout(timer); gate.cancel() }
  }, [placeSearchKeyword, locale, isPlaceSearchFocused, clearResults])

  return {
    placeSearchKeyword, placeSearchResults, placeSearchMessage, isPlaceSearching,
    activePlaceSearchIndex, setActivePlaceSearchIndex, setIsPlaceSearchFocused,
    handlePlaceSearchChange, handlePlaceSearchFocus, selectPlaceSearch,
    isPlaceSearchResultsOpen: isPlaceSearchFocused && placeSearchKeyword.trim().length >= 2,
  }
}
