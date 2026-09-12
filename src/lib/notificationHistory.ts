import { historyTimestamp, selectHistory, type HistoryRange } from './history.ts'
import type { UserNotification, UserNotificationPage } from '../api/notifications'

export type NotificationFeed = { items: UserNotification[]; nextPage: number; hasMore: boolean }
export const emptyNotificationFeed = (): NotificationFeed => ({ items: [], nextPage: 0, hasMore: true })

/** The API sorts newest first. Walk pages until the requested date window is filled. */
export async function loadNotificationHistory(feed: NotificationFeed, range: HistoryRange, wanted: number,
  fetchPage: (page: number) => Promise<UserNotificationPage>, active: () => boolean): Promise<NotificationFeed> {
  let { items, nextPage, hasMore } = feed
  for (let calls = 0; active() && hasMore && items.length < wanted && calls < 5; calls++) {
    const page = await fetchPage(nextPage)
    if (!active()) return feed
    if (!Array.isArray(page.items) || !Number.isInteger(page.totalPages) || page.totalPages < 0) throw new Error('Invalid notification page')
    const merged = new Map(items.map(item => [item.id, item]))
    for (const item of page.items) if (!merged.has(item.id)) merged.set(item.id, item)
    items = selectHistory([...merged.values()], range)
    nextPage++
    hasMore = nextPage < page.totalPages && page.items.length > 0
    if (range.period !== 'all' && page.items.some(item => historyTimestamp(item.createdAt) < Date.parse(`${range.from}T00:00:00+09:00`))) hasMore = false
  }
  return { items, nextPage, hasMore }
}
