'use client'

import { createContext, useContext } from 'react'
import type { ToiletDetailResponse } from '../api/toilets'

export type MapRouteData = { path: string; detail: ToiletDetailResponse | null }
export const MapRouteContext = createContext<{
  mounted: boolean
  register: (route: MapRouteData) => void
} | null>(null)

export function useMapRouteContext() {
  const context = useContext(MapRouteContext)
  if (!context) throw new Error('MapRouteContext is missing')
  return context
}
