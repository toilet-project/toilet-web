'use client'

import { useLayoutEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMapRouteContext } from './mapRouteContext'
import { useLocale, useMessages } from '../i18n/context'
import { localizedPublicPath } from '../i18n/routes'

export function MapRouteFailure({ missing = false, retry }: { missing?: boolean; retry?: () => void }) {
  const locale = useLocale(), t = useMessages()
  const path = usePathname()
  const { register } = useMapRouteContext()
  useLayoutEffect(() => { register({ path, detail: null }) }, [path, register])
  return <aside className="place-card initial-route-card" role="alert">
    <h1>{t(missing ? 'detail.missing' : 'detail.error')}</h1>
    <p>{t(missing ? 'detail.missingHint' : 'detail.errorHint')}</p>
    {retry && <button type="button" className="report-entry-button" onClick={retry}>{t('common.retry')}</button>}
    <Link href={localizedPublicPath('/', locale)!} scroll={false}>{t('detail.back')}</Link>
  </aside>
}
