import Link from 'next/link'
import { useMessages, useLocale } from '../i18n/context'
import { localizedPublicPath } from '../i18n/routes'

export type MobileTab = 'map' | 'notifications' | 'account'
export type MobileAccountView = 'home' | 'likes' | 'achievements' | 'experience' | 'reports' | 'reviews' | 'settings'
type IconName = MobileTab | 'community' | 'regions' | 'settings' | 'likes' | 'achievements'

export function Icon({ name }: { name: IconName }) {
  const paths = {
    map: <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z" /><path d="M9 3v16M15 5v16" /></>,
    community: <><path d="M20 11a8 8 0 0 1-8 8H7l-4 2 1-5a8 8 0 1 1 16-5Z" /><path d="M8 9h8M8 13h5" /></>,
    likes: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
    achievements: <><circle cx="12" cy="9" r="6" /><path d="m8 14-1 7 5-3 5 3-1-7M12 6v6M9 9h6" /></>,
    regions: <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z" /><path d="M9 3v16M15 5v16" /><path d="M12 9a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4Z" /></>,
    notifications: <><path d="M18 9a6 6 0 0 0-12 0c0 6-2 6-2 8h16c0-2-2-2-2-8M10 21h4" /></>,
    account: <><circle cx="12" cy="7.5" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    settings: <><path d="m10 3-.6 2.2-2 .9-2-.7-2 3.4 1.6 1.5v2.4l-1.6 1.5 2 3.4 2-.7 2 .9L10 20h4l.6-2.2 2-.9 2 .7 2-3.4-1.6-1.5v-2.4l1.6-1.5-2-3.4-2 .7-2-.9L14 3Z" /><circle cx="12" cy="11.5" r="3" /></>,
  }
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function MobileNavigation({ tab, onChange, unread }: { tab: MobileTab; onChange: (tab: MobileTab) => void; unread: number }) {
  const t = useMessages(), locale = useLocale()
  return <nav className="mobile-navigation" aria-label={t('nav.main')}>
    <button type="button" aria-current={tab === 'map' ? 'page' : undefined} onClick={() => onChange('map')}><span className="mobile-nav-icon"><Icon name="map" /></span><span>{t('nav.map')}</span></button>
    <Link href={localizedPublicPath('/regions', locale)!} prefetch={true}><span className="mobile-nav-icon"><Icon name="regions" /></span><span>{t('nav.community')}</span></Link>
    <button type="button" aria-current={tab === 'notifications' ? 'page' : undefined} onClick={() => onChange('notifications')}><span className="mobile-nav-icon"><Icon name="notifications" /></span><span>{t('nav.notifications')}</span>{unread > 0 && <b aria-label={t('notification.unreadCount', { count: unread })}>{unread > 99 ? '99+' : unread}</b>}</button>
    <button type="button" aria-current={tab === 'account' ? 'page' : undefined} onClick={() => onChange('account')}><span className="mobile-nav-icon"><Icon name="account" /></span><span>{t('nav.account')}</span></button>
  </nav>
}
