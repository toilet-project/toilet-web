import type { LikeSort } from './toiletEngagement.ts'

export const LIKED_VIEW_KEY = 'geupddong.my-likes-view.v1'
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export type LikedListView = {
  sort: LikeSort; position: { latitude: number; longitude: number } | null
  page: number; scrollTop: number; revision: number
}
const empty = (revision: number): LikedListView => ({ sort: 'newest', position: null, page: 0, scrollTop: 0, revision })

/** Only owner + sort enter tab storage. Coordinates/scroll/page stay in memory; API rows never enter storage. */
export function createLikedListViewStore(storage: () => StoragePort | null) {
  let owner: string | null = null, revision = 0, state = empty(revision)
  const listeners = new Set<(owner: string | null) => void>()
  const persist = () => {
    try {
      if (owner) storage()?.setItem(LIKED_VIEW_KEY, JSON.stringify({ owner, sort: state.sort }))
      else storage()?.removeItem(LIKED_VIEW_KEY)
    } catch { /* Private/storage-disabled tabs keep their view in memory. */ }
  }
  const identify = (next: string | null) => {
    if (next === owner) return
    const first = owner === null
    owner = next; state = empty(++revision)
    if (next && first) {
      try {
        const saved = JSON.parse(storage()?.getItem(LIKED_VIEW_KEY) || 'null')
        if (saved?.owner === next && ['newest', 'oldest', 'distance'].includes(saved.sort)) state.sort = saved.sort
      } catch { /* Ignore malformed values. */ }
    }
    persist()
  }
  return {
    identify,
    read(next: string): LikedListView { identify(next); return { ...state, position: state.position && { ...state.position } } },
    save(next: string, view: LikedListView) {
      // An old screen/late response cannot overwrite a new like, logout or account switch.
      if (next !== owner || view.revision !== state.revision) return false
      state = { ...view, position: view.position && { ...view.position } }; persist(); return true
    },
    changed(next: string, added: boolean) {
      if (owner !== next) return
      state = added ? empty(++revision) : { ...state, page: 0, revision: ++revision }
      persist(); listeners.forEach(listener => listener(owner))
    },
    clear() {
      owner = null; state = empty(++revision); persist()
      listeners.forEach(listener => listener(null))
    },
    subscribe(listener: (owner: string | null) => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}

export const likedListView = createLikedListViewStore(() => typeof window === 'undefined' ? null : window.sessionStorage)

export function likedListScrollContainer(section: HTMLElement): HTMLElement {
  for (let parent = section.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return parent
  }
  return document.scrollingElement as HTMLElement || document.documentElement
}
