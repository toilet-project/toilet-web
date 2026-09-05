'use client'

import dynamic from 'next/dynamic'

// The SDK and browser-only effects stay in the existing map. Policy/SEO routes stay server rendered.
const MapApp = dynamic(() => import('../App'), { ssr: false })

export function MapShell() {
  return <MapApp />
}
