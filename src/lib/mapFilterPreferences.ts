export const MAP_FILTER_ORDER_KEY = 'geupddong:map-filter-order:v1'
export const DEFAULT_MAP_FILTER_ORDER = ['mine', 'hours', 'cctv', 'diaper', 'bell', 'accessible'] as const
export type MapFilterKey = typeof DEFAULT_MAP_FILTER_ORDER[number]
export const MAP_FILTER_BITS = { hours: 1, cctv: 2, diaper: 4, bell: 8, accessible: 16 } as const
export const ACCESSIBLE_FILTER_MASK = 16 | 32 | 64

export function normalizeMapFilterOrder(value: unknown): MapFilterKey[] {
  const selected = Array.isArray(value) ? value.filter((key): key is MapFilterKey =>
    DEFAULT_MAP_FILTER_ORDER.includes(key)) : []
  return [...new Set([...selected, ...DEFAULT_MAP_FILTER_ORDER])]
}

export function readMapFilterOrder(storage: Pick<Storage, 'getItem'>): MapFilterKey[] {
  try { return normalizeMapFilterOrder(JSON.parse(storage.getItem(MAP_FILTER_ORDER_KEY) ?? 'null')) }
  catch { return [...DEFAULT_MAP_FILTER_ORDER] }
}

export function writeMapFilterOrder(storage: Pick<Storage, 'setItem'>, order: MapFilterKey[]): void {
  try { storage.setItem(MAP_FILTER_ORDER_KEY, JSON.stringify(normalizeMapFilterOrder(order))) }
  catch { /* Filtering remains usable in private mode or when storage is full. */ }
}

export function promoteMapFilter(order: MapFilterKey[], key: MapFilterKey): MapFilterKey[] {
  return [key, ...normalizeMapFilterOrder(order).filter(item => item !== key)]
}

export function setMapFilter(flags: number, key: Exclude<MapFilterKey, 'mine'>, selected: boolean): number {
  return selected ? flags | MAP_FILTER_BITS[key] : flags & ~(key === 'accessible' ? ACCESSIBLE_FILTER_MASK : MAP_FILTER_BITS[key])
}

// Both selected is AND (mask 112), not either. With neither gender selected,
// the enabled parent means any accessible stall, as on the existing chip.
export function setAccessibleGender(flags: number, gender: 'male' | 'female', selected: boolean): number {
  const bit = gender === 'male' ? 32 : 64
  return selected ? flags | 16 | bit : flags & ~bit
}
