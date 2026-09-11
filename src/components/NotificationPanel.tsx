import { useEffect, useRef, useState } from 'react'
import { AuthExpiredError } from '../api/auth'
import { useDialogFocus } from '../lib/useDialogFocus'
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type UserNotification } from '../api/notifications'

const date = (value: string) => new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

export function NotificationPanel({ onClose, onCountChange, onOpenReport, onSessionExpired }: { onClose: () => void; onCountChange: () => void; onOpenReport: (reportId: number) => void; onSessionExpired: () => void }) {
  const dialog = useDialogFocus(true, onClose)
  const [items, setItems] = useState<UserNotification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [requestVersion, setRequestVersion] = useState(0)
  const [writing, setWriting] = useState(false)
  const mounted = useRef(false)
  const busy = useRef(false)
  const expireRef = useRef(onSessionExpired)
  useEffect(() => { expireRef.current = onSessionExpired }, [onSessionExpired])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  const failure = (reason: unknown, message: string) => {
    if (!mounted.current) return
    if (reason instanceof AuthExpiredError) { setItems([]); expireRef.current(); return }
    setError(message)
  }

  useEffect(() => {
    let active = true
    void fetchNotifications()
      .then((page) => { if (active) setItems(page.items) })
      .catch((reason: unknown) => {
        if (!active) return
        if (reason instanceof AuthExpiredError) { setItems([]); expireRef.current(); return }
        setError('알림을 불러오지 못했어요. 연결을 확인하고 다시 불러와 주세요.')
      })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [requestVersion])

  const retry = () => {
    if (isLoading || busy.current) return
    setError(null); setIsLoading(true); setRequestVersion(value => value + 1)
  }

  const open = async (notification: UserNotification) => {
    if (busy.current) return
    if (!notification.read) {
      busy.current = true; setWriting(true); setError(null)
      try {
        await markNotificationRead(notification.id)
        if (!mounted.current) return
        setItems((current) => current.map((item) => item.id === notification.id ? { ...item, read: true } : item))
        onCountChange()
      } catch (reason) {
        failure(reason, '읽음 처리하지 못했어요. 알림을 다시 선택해 주세요.')
        return
      } finally { busy.current = false; if (mounted.current) setWriting(false) }
    }
    if (!mounted.current) return
    if (notification.referenceType === 'TOILET_REPORT') onOpenReport(notification.referenceId)
  }

  const readAll = async () => {
    if (busy.current) return
    busy.current = true; setWriting(true); setError(null)
    try {
      await markAllNotificationsRead()
      if (!mounted.current) return
      setItems((current) => current.map((item) => ({ ...item, read: true })))
      onCountChange()
    } catch (reason) {
      failure(reason, '모두 읽음 처리하지 못했어요. 다시 시도해 주세요.')
    } finally { busy.current = false; if (mounted.current) setWriting(false) }
  }

  return <div className="notification-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialog} tabIndex={-1} className="notification-panel" role="dialog" aria-modal="true" aria-labelledby="notification-title">
      <header><div><span>급똥 소식</span><h1 id="notification-title">알림</h1></div><div><button type="button" className="notification-read-all" onClick={() => void readAll()} disabled={writing || isLoading || !items.some((item) => !item.read)}>모두 읽음</button><button type="button" className="notification-close" onClick={onClose} aria-label="알림 닫기">×</button></div></header>
      <div className="notification-list" aria-busy={isLoading || writing}>
        {isLoading && <p className="notification-state" role="status">알림을 불러오는 중…</p>}
        {error && <div className="my-reports-retry"><p className="my-reports-retry-message" role="alert">{error}</p><button className="my-reports-retry-button" type="button" onClick={retry} disabled={isLoading || writing}>다시 불러오기</button></div>}
        {!isLoading && !error && items.length === 0 && <div className="notification-empty"><strong>새로운 알림이 없어요</strong><p>제보 처리 결과가 생기면 이곳에서 알려드릴게요.</p></div>}
        {!isLoading && items.map((item) => <button key={item.id} type="button" disabled={writing} className={`notification-item${item.read ? '' : ' is-unread'}`} onClick={() => void open(item)}>
          <span className={`notification-icon is-${item.type === 'REPORT_APPROVED' ? 'approved' : 'rejected'}`} aria-hidden="true">{item.type === 'REPORT_APPROVED' ? '✓' : '!'}</span>
          <span className="notification-copy"><strong>{item.title}</strong><span>{item.message}</span><time>{date(item.createdAt)}</time></span>
          {!item.read && <i aria-label="읽지 않음" />}
        </button>)}
      </div>
    </section>
  </div>
}
