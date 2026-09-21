'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { AuthExpiredError } from '../api/auth'
import { fetchNotifications, markNotificationRead, type UserNotification } from '../api/notifications'
import { useLocale, useMessages } from '../i18n/context'
import { historyDateLabel } from '../lib/history'

export function NotificationMenu({ owner, open, onOpenChange, unread = 0, onLogin, onOpenReport, onCountChange, onSessionExpired }: {
  owner: string | null; open: boolean; onOpenChange: (open: boolean) => void; unread?: number
  onLogin: () => void; onOpenReport: (id: number) => void; onCountChange: () => void; onSessionExpired: () => void
}) {
  const t = useMessages()
  const id = useId()
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) onOpenChange(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { onOpenChange(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open, onOpenChange])
  return <div className="header-notifications" ref={root} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) onOpenChange(false)
  }}>
    <button ref={trigger} type="button" className="notification-button" aria-expanded={open} aria-controls={id} onClick={() => onOpenChange(!open)} aria-label={unread ? t('map.unread', { count: unread }) : t('nav.notifications')}>
      <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-2.5 7-2.5 9h17C20.5 15 18 15 18 8ZM10 21h4" /></svg>
      {unread > 0 && <span className="header-notifications-dot" />}
    </button>
    {open && <section id={id} className="header-notifications-panel" aria-label={t('nav.notifications')}>
      <header><h2>{t('nav.notifications')}</h2>{unread > 0 && <span>{unread > 99 ? '99+' : unread}</span>}<button type="button" onClick={() => { onOpenChange(false); trigger.current?.focus() }} aria-label={t('common.close')}>×</button></header>
      {owner ? <NotificationMenuFeed key={owner} onCountChange={onCountChange} onOpenReport={id => { onOpenChange(false); onOpenReport(id) }} onSessionExpired={() => { onOpenChange(false); onSessionExpired() }} />
        : <div className="header-notifications-state"><p>{t('auth.title')}</p><button type="button" onClick={() => { onOpenChange(false); onLogin() }}>{t('auth.login')}</button></div>}
    </section>}
  </div>
}

function NotificationMenuFeed({ onOpenReport, onCountChange, onSessionExpired }: { onOpenReport: (id: number) => void; onCountChange: () => void; onSessionExpired: () => void }) {
  const t = useMessages(), locale = useLocale()
  const [items, setItems] = useState<UserNotification[]>([])
  const [page, setPage] = useState(0), [wanted, setWanted] = useState(3), [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true), [writing, setWriting] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0)
  const active = useRef(false), busy = useRef(false), expire = useRef(onSessionExpired)
  useEffect(() => { expire.current = onSessionExpired }, [onSessionExpired])
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    let current = true
    void fetchNotifications(false, page).then(result => {
      if (!current) return
      setItems(previous => {
        const known = new Map((page ? previous : []).map(item => [item.id, item]))
        for (const item of result.items) known.set(item.id, { ...item, read: item.read || known.get(item.id)?.read || false })
        return [...known.values()]
      })
      setHasMore(result.items.length > 0 && result.page + 1 < result.totalPages)
    }).catch(reason => {
      if (!current) return
      if (reason instanceof AuthExpiredError) expire.current()
      else setError(t('notification.loadFailed'))
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [page, attempt, t])
  async function choose(item: UserNotification) {
    if (busy.current || loading) return
    busy.current = true; setWriting(true); setError('')
    try {
      if (!item.read) await markNotificationRead(item.id)
      if (!active.current) return
      setItems(previous => previous.map(value => value.id === item.id ? { ...value, read: true } : value))
      onCountChange()
      if (item.referenceType === 'TOILET_REPORT') onOpenReport(item.referenceId)
    } catch (reason) {
      if (!active.current) return
      if (reason instanceof AuthExpiredError) expire.current()
      else setError(t('notification.readFailed'))
    } finally { busy.current = false; if (active.current) setWriting(false) }
  }
  return <>
    <div className="header-notifications-list" aria-busy={loading || writing}>
      {items.slice(0, wanted).map(item => <button key={item.id} type="button" disabled={writing || loading} className={`header-notification-item${item.read ? '' : ' is-unread'}`} onClick={() => void choose(item)}>
        <span className={`header-notification-symbol${item.type === 'REPORT_REJECTED' ? ' is-rejected' : ''}`} aria-hidden="true">{item.type === 'REPORT_APPROVED' ? '✓' : '!'}</span>
        <span className="header-notification-copy"><strong>{locale !== 'ko' && item.referenceType === 'TOILET_REPORT' ? t(item.type === 'REPORT_APPROVED' ? 'notification.approved' : 'notification.rejected') : item.title}</strong><span>{item.message}</span><time dateTime={item.createdAt}>{historyDateLabel(item.createdAt, locale)}</time></span>
        {!item.read && <i aria-label={t('notification.unread')} />}
      </button>)}
      {loading && <p className="header-notifications-state" role="status">{t('notification.loading')}</p>}
      {error && <div className="header-notifications-state" role="alert"><p>{error}</p><button type="button" disabled={loading || writing} onClick={() => { setError(''); setLoading(true); setAttempt(value => value + 1) }}>{t('common.retry')}</button></div>}
      {!loading && !error && items.length === 0 && <p className="header-notifications-state">{t('notification.empty')}</p>}
    </div>
    {!loading && !error && (wanted < items.length || hasMore) && <button type="button" className="header-notifications-more" disabled={writing} onClick={() => {
      setWanted(value => value + 3)
      if (wanted + 3 > items.length && hasMore) { setLoading(true); setPage(value => value + 1) }
    }}>{t('notification.more')}</button>}
  </>
}
