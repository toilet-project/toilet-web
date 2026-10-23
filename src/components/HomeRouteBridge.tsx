'use client'

import { useLayoutEffect } from 'react'
import { preconnect } from 'react-dom'
import { MapStartup } from './MapStartup'
import { useMapRouteContext } from './mapRouteContext'
import { localizedPublicPath } from '../i18n/routes'
import type { Locale } from '../i18n/locale'

// A home visit needs the startup shell and route registration, without the
// detail card, public reviews or their client dependencies.
export function HomeRouteBridge({ locale = 'ko' }: { locale?: Locale }) {
  const { mounted, register } = useMapRouteContext()
  const path = localizedPublicPath('/', locale)!
  useLayoutEffect(() => { register({ path, detail: null }) }, [path, register])
  if (!mounted) {
    // Emit connection hints in the first HTML, before hydration starts the SDK
    // and public map read. This neither fetches map data nor a visitor position.
    try {
      const api = new URL(process.env.NEXT_PUBLIC_API_BASE_URL ?? '')
      if (api.protocol === 'https:') preconnect(api.origin, { crossOrigin: 'anonymous' })
    } catch { /* Local relative API URLs already use the document connection. */ }
    if (locale === 'ko') {
      preconnect('https://dapi.kakao.com')
      preconnect('https://t1.daumcdn.net')
    } else preconnect('https://oapi.map.naver.com')
  }
  return mounted ? null : <MapStartup locale={locale} />
}
