import { useLocale, useMessages } from '../i18n/context'
import { useEffect, useRef, useState } from 'react'
import { AuthExpiredError } from '../api/auth'
import { useDialogFocus } from '../lib/useDialogFocus'
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type UserNotification } from '../api/notifications'
import { historyDateLabel, historyRange, type HistoryRange } from '../lib/history'
import { emptyNotificationFeed, loadNotificationHistory } from '../lib/notificationHistory'
import { HistoryFilters, HistoryHeading, HistoryMore } from './HistoryControls'

export function NotificationPanel({ onClose, onCountChange, onOpenReport, onSessionExpired, embedded = false, unread = 0 }: {
  onClose: () => void; onCountChange: () => void; onOpenReport: (reportId: number) => void; onSessionExpired: () => void; embedded?: boolean; unread?: number
}) {
  const locale = useLocale(), t = useMessages()
  const dialog = useDialogFocus(!embedded, onClose)
  const [range, setRange] = useState<HistoryRange>(() => historyRange())
  const [feed, setFeed] = useState(emptyNotificationFeed)
  const feedRef = useRef(feed)
  const [wanted, setWanted] = useState(10)
  const [isLoading, setIsLoading] = useState(true)
  const loading = useRef(true)
  const [error, setError] = useState<string | null>(null)
  const [requestVersion, setRequestVersion] = useState(0)
  const [writing, setWriting] = useState(false)
  const mounted = useRef(false), busy = useRef(false)
  const expireRef = useRef(onSessionExpired)
  useEffect(() => { expireRef.current = onSessionExpired }, [onSessionExpired])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const failure = (reason: unknown, message: string) => {
    if (!mounted.current) return
    if (reason instanceof AuthExpiredError) { feedRef.current = emptyNotificationFeed(); setFeed(feedRef.current); expireRef.current(); return }
    setError(message)
  }

  useEffect(() => {
    let active = true
    void loadNotificationHistory(feedRef.current, range, wanted, page => fetchNotifications(false, page), () => active)
      .then(result => { if (active) { feedRef.current = result; setFeed(result) } })
      .catch((reason: unknown) => {
        if (!active) return
        if (reason instanceof AuthExpiredError) { feedRef.current = emptyNotificationFeed(); setFeed(feedRef.current); expireRef.current(); return }
        setError(t('notification.loadFailed'))
      })
      .finally(() => { if (active) { loading.current = false; setIsLoading(false) } })
    return () => { active = false }
  }, [range, wanted, requestVersion, t])

  const startLoad = () => { loading.current = true; setIsLoading(true); setError(null) }
  const retry = () => {
    if (loading.current || busy.current) return
    startLoad(); setRequestVersion(value => value + 1)
  }
  const more = () => {
    if (loading.current || busy.current) return
    startLoad(); setWanted(value => value + 10)
  }
  const markLocal = (id?: number) => {
    feedRef.current = { ...feedRef.current, items: feedRef.current.items.map(item => id === undefined || item.id === id ? { ...item, read: true } : item) }
    setFeed(feedRef.current)
  }

  const open = async (notification: UserNotification) => {
    if (busy.current || loading.current) return
    if (!notification.read) {
      busy.current = true; setWriting(true); setError(null)
      try {
        await markNotificationRead(notification.id)
        if (!mounted.current) return
        markLocal(notification.id); onCountChange()
      } catch (reason) {
        failure(reason, t('notification.readFailed'))
        return
      } finally { busy.current = false; if (mounted.current) setWriting(false) }
    }
    if (!mounted.current) return
    if (notification.referenceType === 'TOILET_REPORT') onOpenReport(notification.referenceId)
  }

  const readAll = async () => {
    if (busy.current || loading.current) return
    busy.current = true; setWriting(true); setError(null)
    try {
      await markAllNotificationsRead()
      if (!mounted.current) return
      markLocal(); onCountChange()
    } catch (reason) {
      failure(reason, t('notification.readAllFailed'))
    } finally { busy.current = false; if (mounted.current) setWriting(false) }
  }

  const visible = feed.items.slice(0, wanted)
  return <div className={embedded ? 'history-list notification-embedded' : 'history-list notification-backdrop'} role="presentation" onMouseDown={event => { if (!embedded && event.target === event.currentTarget) onClose() }}>
    <section ref={dialog} tabIndex={-1} className="notification-panel" role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : true} aria-label={t(embedded ? 'notification.list' : 'nav.notifications')}>
      <HistoryHeading title={t('nav.notifications')} onClose={embedded ? undefined : onClose} />
      <HistoryFilters floatingCalendar value={range} count={feed.items.length} countLabel={isLoading ? t('common.loading') : feed.hasMore ? t('history.atLeast', { count: feed.items.length }) : undefined} onChange={next => {
        if (busy.current) return
        feedRef.current = emptyNotificationFeed(); setFeed(feedRef.current); setWanted(10); startLoad(); setRange(next)
      }} />
      <div className="notification-history-actions"><span>{t('notification.received')}</span><button type="button" onClick={() => void readAll()} title={t('notification.readAllHint')} disabled={writing || isLoading || (unread === 0 && !feed.items.some(item => !item.read))}>{t('notification.readAll')}</button></div>
      <div className="notification-list" aria-busy={isLoading || writing}>
        {error && <div className="my-reports-retry"><p className="my-reports-retry-message" role="alert">{error}</p><button className="my-reports-retry-button" type="button" onClick={retry} disabled={isLoading || writing}>{t('common.retry')}</button></div>}
        {!isLoading && !error && visible.length === 0 && !feed.hasMore && <div className="notification-empty"><strong>{t('notification.empty')}</strong><p>{t('notification.emptyHint')}</p></div>}
        {visible.map(item => <button key={item.id} type="button" disabled={writing || isLoading} className={`notification-item${item.read ? '' : ' is-unread'}`} onClick={() => void open(item)}>
          <span className={`notification-icon is-${item.type === 'REPORT_APPROVED' ? 'approved' : 'rejected'}`} aria-hidden="true">{item.type === 'REPORT_APPROVED' ? '✓' : '!'}</span>
          <span className="notification-copy"><strong>{locale !== 'ko' && item.referenceType === 'TOILET_REPORT' && (item.type === 'REPORT_APPROVED' || item.type === 'REPORT_REJECTED') ? t(item.type === 'REPORT_APPROVED' ? 'notification.approved' : 'notification.rejected') : item.title}</strong><span>{item.message}</span>{locale !== 'ko' && <small>{t('content.original')}</small>}<time>{historyDateLabel(item.createdAt, locale)}</time></span>
          {!item.read && <i aria-label={t('notification.unread')} />}
        </button>)}
        {isLoading && <p className="notification-state" role="status">{t('notification.loading')}</p>}
        {!isLoading && !error && !writing && <HistoryMore key={feed.nextPage} count={visible.length} total={feed.hasMore ? Math.max(feed.items.length, visible.length + 1) : feed.items.length} label={feed.hasMore ? t('notification.more') : undefined} onMore={more} />}
      </div>
    </section>
  </div>
}
