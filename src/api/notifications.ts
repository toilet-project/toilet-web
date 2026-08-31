import { createApiUrl } from '../config/api'

export type UserNotification = {
  id: number
  type: 'REPORT_APPROVED' | 'REPORT_REJECTED'
  referenceType: string
  referenceId: number
  title: string
  message: string
  read: boolean
  readAt?: string | null
  createdAt: string
}

export type UserNotificationPage = {
  items: UserNotification[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}

async function checked(response: Response, fallback: string) {
  if (response.status === 401) throw new Error('로그인이 필요합니다.')
  if (!response.ok) throw new Error(fallback)
  return response
}

export async function fetchNotifications(unreadOnly = false, page = 0): Promise<UserNotificationPage> {
  const query = new URLSearchParams({ unreadOnly: String(unreadOnly), page: String(page), size: '20' })
  const response = await checked(await fetch(createApiUrl(`/api/v1/notifications?${query}`), { credentials: 'include' }), '알림을 불러오지 못했습니다.')
  return response.json() as Promise<UserNotificationPage>
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const response = await checked(await fetch(createApiUrl('/api/v1/notifications/unread-count'), { credentials: 'include' }), '알림 수를 확인하지 못했습니다.')
  const payload = await response.json() as { count: number }
  return payload.count
}

export async function markNotificationRead(notificationId: number) {
  await checked(await fetch(createApiUrl(`/api/v1/notifications/${notificationId}/read`), { method: 'PATCH', credentials: 'include' }), '알림을 읽음 처리하지 못했습니다.')
}

export async function markAllNotificationsRead() {
  await checked(await fetch(createApiUrl('/api/v1/notifications/read-all'), { method: 'POST', credentials: 'include' }), '알림을 모두 읽음 처리하지 못했습니다.')
}
