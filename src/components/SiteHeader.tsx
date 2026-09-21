'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getCurrentUser, logout, type AuthProfile } from '../api/auth'
import { useLocale, useMessages } from '../i18n/context'
import { localizedPublicPath } from '../i18n/routes'
import { LanguageSelector } from './LanguageSelector'
import { BrandWordmark } from './BrandWordmark'
import { ProfileMenu } from './ProfileMenu'
import { regionText } from './regions/regionText'

function BottomIcon({ name }: { name: 'map' | 'regions' | 'notifications' | 'account' }) {
  const shape = name === 'map' ? <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z" /><path d="M9 3v16M15 5v16" /></>
    : name === 'regions' ? <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z" /><path d="M9 3v16M15 5v16" /><circle cx="12" cy="11" r="2.2" /></>
      : name === 'notifications' ? <><path d="M18 9a6 6 0 0 0-12 0c0 6-2 6-2 8h16c0-2-2-2-2-8M10 21h4" /></>
        : <><circle cx="12" cy="7.5" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shape}</svg>
}

export function SiteHeader({ path }: { path: string }) {
  const locale = useLocale(), t = useMessages(), r = regionText(locale), router = useRouter()
  const [profile, setProfile] = useState<AuthProfile | null>(null)
  const [ready, setReady] = useState(false)
  const [search, setSearch] = useState('')
  useEffect(() => { let active = true; void getCurrentUser().then(value => { if (active) setProfile(value) }).catch(() => undefined).finally(() => { if (active) setReady(true) }); return () => { active = false } }, [])
  const home = localizedPublicPath('/', locale)!, regions = localizedPublicPath('/regions', locale)!
  const account = localizedPublicPath('/account', locale)!
  return <>
    <header className="site-topbar"><div className="site-topbar-inner">
      <Link className="site-header-brand" href={home} aria-label={t('map.home')}><BrandWordmark locale={locale} /></Link>
      <form className="site-header-search" onSubmit={event => { event.preventDefault(); if (search.trim()) router.push(`${home}?q=${encodeURIComponent(search.trim())}`) }}>
        <label className="sr-only" htmlFor="region-site-search">{r.search}</label>
        <input id="region-site-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={r.search} />
      </form>
      <nav className="site-header-links" aria-label={t('nav.main')}><Link href={home}>{t('nav.map')}</Link><Link href={regions} aria-current={path.startsWith('/regions') ? 'page' : undefined}>{r.regions}</Link></nav>
      <div className="site-header-space" />
      <div className="site-header-actions">
        <Link className="site-header-bell" href={`${account}?view=notifications`} aria-label={r.notifications}><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-2.5 7-2.5 9h17C20.5 15 18 15 18 8ZM10 21h4" /></svg></Link>
        {ready && (profile ? <ProfileMenu profile={profile} onLogout={() => { void logout().then(() => { setProfile(null); router.push(home) }) }} /> : <Link className="site-header-login" href={account}>{t('auth.login')}</Link>)}
        <LanguageSelector locale={locale} onSelect={next => { router.push(localizedPublicPath(path, next) ?? localizedPublicPath('/', next)!) }} />
      </div>
    </div></header>
    <nav className="site-mobile-nav" aria-label={t('nav.main')}>
      <Link href={home} aria-current={path === '/' ? 'page' : undefined}><span><BottomIcon name="map" /></span>{t('nav.map')}</Link>
      <Link href={regions} aria-current={path.startsWith('/regions') ? 'page' : undefined}><span><BottomIcon name="regions" /></span>{t('nav.community')}</Link>
      <Link href={`${account}?view=notifications`}><span><BottomIcon name="notifications" /></span>{r.notifications}</Link>
      <Link href={account} aria-current={path === '/account' ? 'page' : undefined}><span><BottomIcon name="account" /></span>{r.account}</Link>
    </nav>
  </>
}
