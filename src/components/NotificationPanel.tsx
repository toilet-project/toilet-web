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
        setError('알림을 불러오지 못했어요. 연결을 확인하고 다시 불러와 주세요.')
      })
      .finally(() => { if (active) { loading.current = false; setIsLoading(false) } })
    return () => { active = false }
  }, [range, wanted, requestVersion])

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
        failure(reason, '읽음 처리하지 못했어요. 알림을 다시 선택해 주세요.')
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
      failure(reason, '모두 읽음 처리하지 못했어요. 다시 시도해 주세요.')
    } finally { busy.current = false; if (mounted.current) setWriting(false) }
  }

  const visible = feed.items.slice(0, wanted)
  return <div className={embedded ? 'history-list notification-embedded' : 'history-list notification-backdrop'} role="presentation" onMouseDown={event => { if (!embedded && event.target === event.currentTarget) onClose() }}>
    <section ref={dialog} tabIndex={-1} className="notification-panel" role={embedded ? 'region' : 'dialog'} aria-modal={embedded ? undefined : true} aria-label={embedded ? '받은 알림 목록' : '알림'}>
      <HistoryHeading title="알림" onClose={embedded ? undefined : onClose} />
      <HistoryFilters floatingCalendar value={range} count={feed.items.length} countLabel={isLoading ? '불러오는 중…' : feed.hasMore ? `${feed.items.length}개 이상 · 최신순` : undefined} onChange={next => {
        if (busy.current) return
        feedRef.current = emptyNotificationFeed(); setFeed(feedRef.current); setWanted(10); startLoad(); setRange(next)
      }} />
      <div className="notification-history-actions"><span>받은 알림</span><button type="button" onClick={() => void readAll()} title="선택 기간과 관계없이 모든 알림을 읽음 처리" disabled={writing || isLoading || (unread === 0 && !feed.items.some(item => !item.read))}>모두 읽음</button></div>
      <div className="notification-list" aria-busy={isLoading || writing}>
        {error && <div className="my-reports-retry"><p className="my-reports-retry-message" role="alert">{error}</p><button className="my-reports-retry-button" type="button" onClick={retry} disabled={isLoading || writing}>다시 불러오기</button></div>}
        {!isLoading && !error && visible.length === 0 && !feed.hasMore && <div className="notification-empty"><strong>이 기간에 받은 알림이 없어요</strong><p>제보 처리 결과가 생기면 이곳에서 알려드릴게요.</p></div>}
        {visible.map(item => <button key={item.id} type="button" disabled={writing || isLoading} className={`notification-item${item.read ? '' : ' is-unread'}`} onClick={() => void open(item)}>
          <span className={`notification-icon is-${item.type === 'REPORT_APPROVED' ? 'approved' : 'rejected'}`} aria-hidden="true">{item.type === 'REPORT_APPROVED' ? '✓' : '!'}</span>
          <span className="notification-copy"><strong>{item.title}</strong><span>{item.message}</span><time>{historyDateLabel(item.createdAt)}</time></span>
          {!item.read && <i aria-label="읽지 않음" />}
        </button>)}
        {isLoading && <p className="notification-state" role="status">알림을 불러오는 중…</p>}
        {!isLoading && !error && !writing && <HistoryMore key={feed.nextPage} count={visible.length} total={feed.hasMore ? Math.max(feed.items.length, visible.length + 1) : feed.items.length} label={feed.hasMore ? '알림 더 보기' : undefined} onMore={more} />}
      </div>
    </section>
  </div>
}
