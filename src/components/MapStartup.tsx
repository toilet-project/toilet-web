import type { Locale } from '../i18n/locale'
import { message } from '../i18n/messages'
import { homeCopy } from '../i18n/homeCopy'
import { localizedPublicPath } from '../i18n/routes'
import { BrandWordmark } from './BrandWordmark'
import { HeaderIcon } from './HeaderIcon'
import { SiteFooter } from './SiteFooter'
import { regionText } from './regions/regionText'

/** Shared by the first HTML and the SDK wait. No location, auth or data requests. */
export function MapLoadingState({ locale }: { locale: Locale }) {
  return <div className="map-startup-status" role="status">
    <span className="map-startup-spinner" aria-hidden="true" />
    <span>{message(locale, 'map.loading')}</span>
  </div>
}

export function MapStartup({ locale }: { locale: Locale }) {
  const t = (key: Parameters<typeof message>[1]) => message(locale, key)
  const home = localizedPublicPath('/', locale)!
  const regions = localizedPublicPath('/regions', locale)!
  return <main className="app-shell has-mobile-navigation map-startup">
    <h1 className="sr-only">{homeCopy[locale].heading}</h1>
    <header className="topbar"><div className="topbar-inner">
      <a className="brand" href={home} aria-label={t('map.home')}><BrandWordmark locale={locale} /></a>
      <div className="place-search"><input className="place-search-input" type="search" disabled placeholder={t('map.search')} aria-label={t('map.search')} /></div>
      <nav className="primary-navigation" aria-label={t('nav.main')}>
        <a href={home} aria-current="page"><span className="primary-navigation-icon"><HeaderIcon name="map" /></span>{t('nav.map')}</a>
        <a href={regions}><span className="primary-navigation-icon"><HeaderIcon name="regions" /></span>{regionText(locale).regions}</a>
      </nav>
      <div className="map-startup-account" aria-hidden="true"><span /><i /></div>
    </div></header>
    <section className="map-section" aria-label={t('map.title')}><MapLoadingState locale={locale} /></section>
    <SiteFooter />
    <nav className="mobile-navigation map-startup-navigation" aria-label={t('nav.main')}>
      <a href={home} aria-current="page"><span className="mobile-nav-icon"><HeaderIcon name="map" /></span><span>{t('nav.map')}</span></a>
      <a href={regions}><span className="mobile-nav-icon"><HeaderIcon name="regions" /></span><span>{t('nav.community')}</span></a>
      <button type="button" disabled><span className="mobile-nav-icon"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 6-2 6-2 8h16c0-2-2-2-2-8M10 21h4" /></svg></span><span>{t('nav.notifications')}</span></button>
      <button type="button" disabled><span className="mobile-nav-icon"><HeaderIcon name="account" /></span><span>{t('nav.account')}</span></button>
    </nav>
  </main>
}
