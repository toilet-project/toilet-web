import { decodeGrowthBadge, type GrowthBadge } from './growth.ts'
export type GrowthAwardNotice = { id: string; badge: GrowthBadge }
export function decodeAwardNotices(value: unknown): GrowthAwardNotice[] {
  const items = (value as { items?: unknown } | null)?.items
  if (!Array.isArray(items) || items.length > 50) throw new Error('INVALID_AWARD_NOTICES')
  const ids = new Set<string>()
  return items.map(item => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !/^[1-9]\d{0,17}$/.test(item.id) || ids.has(item.id)) throw new Error('INVALID_AWARD_NOTICES')
    ids.add(item.id)
    return { id: item.id, badge: decodeGrowthBadge(item.badge) }
  })
}

export type AwardNoticeState = { items: GrowthAwardNotice[]; saving: boolean; error: boolean }
export const EMPTY_AWARD_NOTICES: AwardNoticeState = Object.freeze({ items: [], saving: false, error: false })
/** Account-scoped memory only. Acknowledgement is server-owned; failed writes are not silently replayed. */
export function createAwardNoticeStore(dependencies: { read: () => Promise<GrowthAwardNotice[]>; acknowledge: (ids: string[]) => Promise<void> }) {
  type Entry = { state: AwardNoticeState; pending: Promise<void> | null; acknowledgement: Promise<boolean> | null }
  const entries = new Map<string, Entry>(), listeners = new Set<() => void>()
  const emit = () => listeners.forEach(listener => listener())
  const entry = (owner: string) => {
    if (!entries.has(owner)) entries.set(owner, { state: EMPTY_AWARD_NOTICES, pending: null, acknowledgement: null })
    return entries.get(owner)!
  }
  async function load(owner: string) {
    const current = entry(owner)
    if (current.acknowledgement) { await current.acknowledgement; if (entries.get(owner) === current) return load(owner); return }
    if (current.pending) return current.pending
    const active = () => entries.get(owner) === current
    const pending = (async () => {
      try {
        const items = await dependencies.read()
        if (active()) { current.state = { ...current.state, items }; emit() }
      } catch { /* Existing API deployments may not support notifications yet; never invent ownership. */ }
      finally { if (active()) current.pending = null }
    })()
    current.pending = pending
    return pending
  }
  async function acknowledge(owner: string): Promise<boolean> {
    const current = entry(owner)
    if (current.acknowledgement) return current.acknowledgement
    const ids = current.state.items.map(item => item.id)
    if (!ids.length) return true
    const active = () => entries.get(owner) === current
    current.state = { ...current.state, saving: true, error: false }; emit()
    const pending = (async () => {
      try {
        // Do not allow a GET started before this acknowledgement to resurrect dismissed items.
        if (current.pending) await current.pending
        if (!active()) return false
        await dependencies.acknowledge(ids)
        if (!active()) return false
        current.state = { items: current.state.items.filter(item => !ids.includes(item.id)), saving: false, error: false }; emit()
        return true
      } catch {
        if (active()) { current.state = { ...current.state, saving: false, error: true }; emit() }
        return false
      } finally { if (active()) current.acknowledgement = null }
    })()
    current.acknowledgement = pending
    return pending
  }
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    get: (owner: string | null) => owner ? entry(owner).state : EMPTY_AWARD_NOTICES,
    load, acknowledge,
    clear: () => { entries.clear(); emit() },
  }
}
