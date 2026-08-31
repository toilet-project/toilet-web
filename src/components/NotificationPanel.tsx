import { useEffect, useState } from 'react'
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type UserNotification } from '../api/notifications'

const date = (value: string) => new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

export function NotificationPanel({ onClose, onCountChange, onOpenReport }: { onClose: () => void; onCountChange: () => void; onOpenReport: (reportId: number) => void }) {
  const [items, setItems] = useState<UserNotification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void fetchNotifications()
      .then((page) => { if (active) setItems(page.items) })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : '알림을 불러오지 못했습니다.') })
      .finally(() => { if (active) setIsLoading(false) })
    return () => { active = false }
  }, [])

  const open = async (notification: UserNotification) => {
    if (!notification.read) {
      try {
        await markNotificationRead(notification.id)
        setItems((current) => current.map((item) => item.id === notification.id ? { ...item, read: true } : item))
        onCountChange()
      } catch { /* 상세 진입은 유지하고 다음 조회에서 다시 읽음 처리를 시도한다. */ }
    }
    if (notification.referenceType === 'TOILET_REPORT') onOpenReport(notification.referenceId)
  }

  const readAll = async () => {
    try {
      await markAllNotificationsRead()
      setItems((current) => current.map((item) => ({ ...item, read: true })))
      onCountChange()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '알림을 모두 읽음 처리하지 못했습니다.')
    }
  }

  return <div className="notification-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="notification-panel" role="dialog" aria-modal="true" aria-labelledby="notification-title">
      <header><div><span>급똥 소식</span><h1 id="notification-title">알림</h1></div><div><button type="button" className="notification-read-all" onClick={() => void readAll()} disabled={!items.some((item) => !item.read)}>모두 읽음</button><button type="button" className="notification-close" onClick={onClose} aria-label="알림 닫기">×</button></div></header>
      <div className="notification-list">
        {isLoading && <p className="notification-state">알림을 불러오는 중…</p>}
        {error && <p className="notification-state is-error" role="alert">{error}</p>}
        {!isLoading && !error && items.length === 0 && <div className="notification-empty"><strong>새로운 알림이 없어요</strong><p>제보 처리 결과가 생기면 이곳에서 알려드릴게요.</p></div>}
        {!isLoading && items.map((item) => <button key={item.id} type="button" className={`notification-item${item.read ? '' : ' is-unread'}`} onClick={() => void open(item)}>
          <span className={`notification-icon is-${item.type === 'REPORT_APPROVED' ? 'approved' : 'rejected'}`} aria-hidden="true">{item.type === 'REPORT_APPROVED' ? '✓' : '!'}</span>
          <span className="notification-copy"><strong>{item.title}</strong><span>{item.message}</span><time>{date(item.createdAt)}</time></span>
          {!item.read && <i aria-label="읽지 않음" />}
        </button>)}
      </div>
    </section>
  </div>
}
