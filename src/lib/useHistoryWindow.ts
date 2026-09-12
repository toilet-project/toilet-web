import { useState } from 'react'
import { historyWindowSize } from './history'

export function historyScroller(element: HTMLElement) {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return parent
  }
  return null
}
export function useHistoryWindow(total: number, filterKey: string, focusedIndex = -1) {
  const [pageState, setPageState] = useState({ key: filterKey, count: 10 })
  const count = historyWindowSize(pageState.key === filterKey ? pageState.count : 10, total, focusedIndex)
  return { count, more: count < total, reset: () => setPageState({ key: '', count: 10 }), loadMore: () => setPageState({ key: filterKey, count: Math.min(total, count + 10) }) }
}
