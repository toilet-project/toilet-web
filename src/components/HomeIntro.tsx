import Link from 'next/link'
import type { Locale } from '../i18n/locale'
import { homeCopy } from '../i18n/homeCopy'
import { localizedPublicPath } from '../i18n/routes'

export function HomeIntro({ locale, compact = false }: { locale: Locale; compact?: boolean }) {
  const copy = homeCopy[locale]
  if (compact) return <h1 className="map-footer-heading">{copy.heading}</h1>
  return <div className="map-home-intro">
    <div><h1>{copy.heading}</h1><p>{copy.intro}</p></div>
    <Link href={localizedPublicPath('/regions', locale)!}>{copy.regions}<span aria-hidden="true"> →</span></Link>
  </div>
}
