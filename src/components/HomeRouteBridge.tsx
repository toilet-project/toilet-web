'use client'

import { useLayoutEffect } from 'react'
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
  return mounted ? null : <MapStartup locale={locale} />
}
