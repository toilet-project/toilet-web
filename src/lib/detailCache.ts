// Public details only. Keep a small, short-lived cache within the mounted map.
export function createDetailCache<T extends { id: number }>(ttl = 30_000, limit = 30, now = Date.now) {
  const entries = new Map<number, { value: T; expires: number }>()
  return {
    get(id: number): T | null {
      const entry = entries.get(id)
      if (!entry) return null
      if (entry.expires <= now()) { entries.delete(id); return null }
      return entry.value
    },
    set(value: T) {
      entries.delete(value.id)
      entries.set(value.id, { value, expires: now() + ttl })
      while (entries.size > limit) entries.delete(entries.keys().next().value!)
    },
  }
}
