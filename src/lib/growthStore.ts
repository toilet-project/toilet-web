import type { GrowthResponse, GrowthSummary } from './growth.ts'
export type GrowthState = { status: 'idle' | 'loading' | 'ready' | 'disabled' | 'error' | 'signedOut'; summary: GrowthSummary | null; checkInError: boolean }
export const EMPTY_GROWTH: GrowthState = Object.freeze({ status: 'idle', summary: null, checkInError: false })
export const DISABLED_GROWTH: GrowthState = Object.freeze({ status: 'disabled', summary: null, checkInError: false })
type Entry = { state: GrowthState; pending: Promise<void> | null; updatedAt: number; generation: number }
/** Browser-memory cache only. It cannot invent XP, persist identity, or allow stale requests to cross account boundaries. */
export function createGrowthStore(dependencies: { enabled: boolean; read: () => Promise<GrowthResponse>; checkIn: () => Promise<GrowthResponse>; expired: (error: unknown) => boolean; now?: () => number }) {
  const entries = new Map<string, Entry>(), listeners = new Set<() => void>()
  const now = dependencies.now ?? Date.now
  const emit = () => listeners.forEach(listener => listener())
  const entry = (owner: string) => {
    if (!entries.has(owner)) entries.set(owner, { state: EMPTY_GROWTH, pending: null, updatedAt: 0, generation: 0 })
    return entries.get(owner)!
  }
  async function load(owner: string, force = false): Promise<void> {
    if (!dependencies.enabled || !owner) return
    const current = entry(owner)
    if (current.pending) {
      await current.pending
      // A review can be saved while the previous GET is in flight. A forced
      // refresh must read again after it, unless the member has signed out.
      if (force && entries.get(owner) === current) return load(owner, true)
      return
    }
    if (!force && current.updatedAt && now() - current.updatedAt < 60_000) return
    const generation = current.generation
    const active = () => entries.get(owner) === current && current.generation === generation
    current.state = { status: 'loading', summary: current.state.summary, checkInError: false }; emit()
    const pending = (async () => {
      try {
        let value = await dependencies.read()
        if (!active()) return
        let checkInError = false
        if (value.enabled && value.checkInAvailable) {
          try { value = await dependencies.checkIn() }
          catch (error) { if (dependencies.expired(error)) throw error; checkInError = true }
        }
        if (!active()) return
        current.state = value.enabled ? { status: 'ready', summary: value, checkInError } : DISABLED_GROWTH
        current.updatedAt = now()
      } catch (error) {
        if (!active()) return
        current.state = { status: dependencies.expired(error) ? 'signedOut' : 'error', summary: null, checkInError: false }
      } finally { if (active()) { current.pending = null; emit() } }
    })()
    current.pending = pending
    return pending
  }
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    get: (owner: string | null): GrowthState => !dependencies.enabled ? DISABLED_GROWTH : owner ? entry(owner).state : EMPTY_GROWTH,
    load,
    refresh: (owner: string) => load(owner, true),
    clear: () => { entries.forEach(value => value.generation++); entries.clear(); emit() },
  }
}
