'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { localeForPath } from './routes'
import { LocaleContext } from './context'

// usePathname renders on the server too. Explicit /en routes need no cookie/header
// lookup, rewrite, or client-only lang patch. The shared map layout stays mounted.
export function LocaleDocument({ children }: { children: ReactNode }) {
  const locale = localeForPath(usePathname())
  return <html lang={locale}><LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider></html>
}
