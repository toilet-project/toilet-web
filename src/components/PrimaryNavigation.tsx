'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useLocale, useMessages } from '../i18n/context'
import { localizedPublicPath } from '../i18n/routes'
import { HeaderIcon } from './HeaderIcon'
import { regionText } from './regions/regionText'

export function PrimaryNavigation({ active, className = '', regionsPrefetch = true }: { active?: 'map' | 'regions'; className?: string; regionsPrefetch?: boolean }) {
  const locale = useLocale(), t = useMessages(), r = regionText(locale)
  const [regionsInterested, setRegionsInterested] = useState(false)
  return <nav className={`primary-navigation ${className}`} aria-label={t('nav.main')}>
    <Link href={localizedPublicPath('/', locale)!} aria-current={active === 'map' ? 'page' : undefined}><span className="primary-navigation-icon"><HeaderIcon name="map" /></span><span>{t('nav.map')}</span></Link>
    <Link href={localizedPublicPath('/regions', locale)!} prefetch={active !== 'regions' && (regionsPrefetch || regionsInterested)} onMouseEnter={() => setRegionsInterested(true)} onFocus={() => setRegionsInterested(true)} onTouchStart={() => setRegionsInterested(true)} aria-current={active === 'regions' ? 'page' : undefined}><span className="primary-navigation-icon"><HeaderIcon name="regions" /></span><span>{r.regions}</span></Link>
  </nav>
}
