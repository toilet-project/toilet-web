'use client'
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { GROWTH_ENABLED } from './growth'
import { DISABLED_GROWTH, EMPTY_GROWTH } from './growthStore'
import { memberGrowth as store } from './memberGrowth'
export { refreshGrowth, clearGrowth } from './memberGrowth'
export function useGrowth(owner: string | null) {
  const read = useCallback(() => store.get(owner), [owner])
  const state = useSyncExternalStore(store.subscribe, read, () => GROWTH_ENABLED ? EMPTY_GROWTH : DISABLED_GROWTH)
  useEffect(() => {
    if (!owner) return
    const load = () => { void store.load(owner) }
    load(); window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [owner])
  const refresh = useCallback(() => { if (owner) void store.refresh(owner) }, [owner])
  return { ...state, refresh }
}
