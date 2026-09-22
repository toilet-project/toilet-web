'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AuthExpiredError, getCurrentUser, logout, type AuthProfile } from '../api/auth'
import { fetchUnreadNotificationCount } from '../api/notifications'
import { useLocale, useMessages } from '../i18n/context'
import { localizedPublicPath } from '../i18n/routes'
import { LanguageSelector } from './LanguageSelector'
import { BrandWordmark } from './BrandWordmark'
import { ProfileMenu } from './ProfileMenu'
import { PrimaryNavigation } from './PrimaryNavigation'
import { HeaderIcon } from './HeaderIcon'
import { NotificationMenu } from './NotificationMenu'
import { regionText } from './regions/regionText'
import { loadedNaverMapLanguage, naverMapLanguageForLocale, naverMapLanguageNeedsReload } from '../lib/mapProviderSelection'
import type { Locale } from '../i18n/locale'

function BottomIcon({ name }: { name: 'map' | 'regions' | 'notifications' | 'account' }) {
  const shape = name === 'map' ? <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z" /><path d="M9 3v16M15 5v16" /></>
    : name === 'regions' ? <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z" /><path d="M9 3v16M15 5v16" /><circle cx="12" cy="11" r="2.2" /></>
      : name === 'notifications' ? <><path d="M18 9a6 6 0 0 0-12 0c0 6-2 6-2 8h16c0-2-2-2-2-8M10 21h4" /></>
        : <><circle cx="12" cy="7.5" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shape}</svg>
}

export function SiteHeader({ path, languagePaths }: { path: string; languagePaths?: Partial<Record<Locale, string>> }) {
  const locale = useLocale(), t = useMessages(), r = regionText(locale), router = useRouter()
  const [profile, setProfile] = useState<AuthProfile | null>(null)
  const [ready, setReady] = useState(false)
  const [search, setSearch] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [unread, setUnread] = useState(0), [notificationVersion, setNotificationVersion] = useState(0)
  useEffect(() => { let active = true; void getCurrentUser().then(value => { if (active) setProfile(value) }).catch(() => undefined).finally(() => { if (active) setReady(true) }); return () => { active = false } }, [])
  const notificationOwner = profile?.userId
  useEffect(() => {
    if (!notificationOwner) return
    let active = true
    const refresh = () => void fetchUnreadNotificationCount().then(count => { if (active) setUnread(count) }).catch(reason => { if (active && reason instanceof AuthExpiredError) { setProfile(null); setUnread(0); setNotificationsOpen(false) } })
    refresh()
    const interval = window.setInterval(refresh, 60_000)
    return () => { active = false; window.clearInterval(interval) }
  }, [notificationOwner, notificationVersion])
  const home = localizedPublicPath('/', locale)!, regions = localizedPublicPath('/regions', locale)!
  const account = localizedPublicPath('/account', locale)!
  return <>
    <header className="site-topbar"><div className="site-topbar-inner">
      <Link className="brand site-header-brand" href={home} aria-label={t('map.home')}><BrandWordmark locale={locale} /></Link>
      <form className="site-header-search" onSubmit={event => { event.preventDefault(); if (search.trim()) router.push(`${home}?q=${encodeURIComponent(search.trim())}`) }}>
        <label className="sr-only" htmlFor="region-site-search">{r.search}</label>
        <input id="region-site-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={r.search} />
      </form>
      <PrimaryNavigation className="site-header-links" active={path.startsWith('/regions') ? 'regions' : undefined} />
      <div className="site-header-actions">
        <NotificationMenu owner={profile?.userId ?? null} open={notificationsOpen} onOpenChange={setNotificationsOpen} unread={profile ? unread : 0} onLogin={() => router.push(account)} onCountChange={() => setNotificationVersion(value => value + 1)} onSessionExpired={() => { setProfile(null); setUnread(0) }} onOpenReport={id => router.push(`${account}?view=reports&report=${id}`)} />
        {ready && (profile ? <ProfileMenu profile={profile} onLogout={() => { void logout().then(() => { setProfile(null); router.push(home) }) }} /> : <Link className="site-header-login" href={account}><HeaderIcon name="account" /><span>{t('auth.login')}</span></Link>)}
        <LanguageSelector locale={locale} onSelect={next => {
          const target = languagePaths?.[next] ?? localizedPublicPath(path, next) ?? localizedPublicPath('/', next)!
          // NAVER fixes label language when its SDK loads; switching it in-place leaves this map blank.
          if (naverMapLanguageNeedsReload(loadedNaverMapLanguage(), naverMapLanguageForLocale(next))) {
            window.location.assign(target)
          } else router.push(target)
        }} />
      </div>
    </div></header>
    <nav className="mobile-navigation site-mobile-nav" aria-label={t('nav.main')}>
      <Link href={home} aria-current={path === '/' ? 'page' : undefined}><span className="mobile-nav-icon"><BottomIcon name="map" /></span><span>{t('nav.map')}</span></Link>
      <Link href={regions} aria-current={path.startsWith('/regions') ? 'page' : undefined}><span className="mobile-nav-icon"><BottomIcon name="regions" /></span><span>{t('nav.community')}</span></Link>
      <Link href={`${home}?tab=notifications`}><span className="mobile-nav-icon"><BottomIcon name="notifications" /></span><span>{t('nav.notifications')}</span></Link>
      <Link href={`${home}?tab=account`} aria-current={path === '/account' ? 'page' : undefined}><span className="mobile-nav-icon"><BottomIcon name="account" /></span><span>{t('nav.account')}</span></Link>
    </nav>
  </>
}
