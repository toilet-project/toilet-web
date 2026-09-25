'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { useLocale } from '../../i18n/context'
import { SUPPORTED_LOCALES } from '../../i18n/locale'
import { localizedPublicPath, parseLocalizedPublicPath } from '../../i18n/routes'
import { SiteHeader } from '../SiteHeader'
import { SiteFooter } from '../SiteFooter'
import { regionText } from './regionText'

/** Persist the header and footer across nationwide, province and district routes. */
export function RegionShell({ children }: { children: ReactNode }) {
  const locale = useLocale()
  const path = parseLocalizedPublicPath(usePathname() ?? '/regions')?.path ?? '/regions'
  const codes = path.split('/').slice(2).map(part => part.match(/-(\d{2,5})$/)?.[1] ?? '')
  const codePath = codes.length === 2 && /^\d{2}$/.test(codes[0]) && /^\d{5}$/.test(codes[1])
    ? `/regions/${codes[0]}/${codes[1]}`
    : codes.length === 1 && /^\d{2}$/.test(codes[0]) ? `/regions/${codes[0]}` : '/regions'
  const languagePaths = Object.fromEntries(SUPPORTED_LOCALES.map(language => [language,
    localizedPublicPath(codePath, language)!]))
  return <div className="region-site-shell is-region-page">
    <SiteHeader path={path} languagePaths={languagePaths} />
    {children}
    <SiteFooter hint={regionText(locale).intro} />
  </div>
}
