export const MAP_FILTER_SELECTION_KEY = 'geupddong:map-filter-selection:v1'
export const DEFAULT_MAP_FILTER_ORDER = ['hours', 'mine', 'bell', 'cctv', 'accessible', 'diaper'] as const
export type MapFilterKey = typeof DEFAULT_MAP_FILTER_ORDER[number]
export const MAP_FILTER_BITS = { hours: 1, cctv: 2, diaper: 4, bell: 8, accessible: 16 } as const
export const ACCESSIBLE_FILTER_MASK = 16 | 32 | 64

export function orderMapFilters(order: readonly MapFilterKey[], selection: MapFilterSelection): MapFilterKey[] {
  const selected = (item: MapFilterKey) => item === 'mine' ? selection.mine : (selection.flags & MAP_FILTER_BITS[item]) !== 0
  const complete = [...new Set([...order, ...DEFAULT_MAP_FILTER_ORDER])]
  return [...complete.filter(selected), ...DEFAULT_MAP_FILTER_ORDER.filter(item => !selected(item))]
}

export function appendSelectedMapFilter(order: readonly MapFilterKey[], key: MapFilterKey, previousSelection: MapFilterSelection): MapFilterKey[] {
  const wasSelected = key === 'mine' ? previousSelection.mine : (previousSelection.flags & MAP_FILTER_BITS[key]) !== 0
  // Adding another gender to an enabled accessible filter must not move it again.
  if (wasSelected) return orderMapFilters(order, previousSelection)
  const nextSelection = key === 'mine' ? { ...previousSelection, mine: true }
    : { ...previousSelection, flags: previousSelection.flags | MAP_FILTER_BITS[key] }
  return orderMapFilters([...order.filter(item => item !== key), key], nextSelection)
}

export type MapFilterSelection = { flags: number; mine: boolean }

export function normalizeMapFilterSelection(value: unknown): MapFilterSelection {
  const input = value && typeof value === 'object' ? value as Partial<MapFilterSelection> : {}
  let flags = typeof input.flags === 'number' && Number.isInteger(input.flags) && input.flags >= 0 && input.flags <= 127 ? input.flags : 0
  if (flags & 96) flags |= 16
  return { flags, mine: input.mine === true }
}

export function readMapFilterSelection(storage: Pick<Storage, 'getItem'>): MapFilterSelection {
  try { return normalizeMapFilterSelection(JSON.parse(storage.getItem(MAP_FILTER_SELECTION_KEY) ?? 'null')) }
  catch { return { flags: 0, mine: false } }
}

export function writeMapFilterSelection(storage: Pick<Storage, 'setItem'>, selection: MapFilterSelection): void {
  try { storage.setItem(MAP_FILTER_SELECTION_KEY, JSON.stringify(normalizeMapFilterSelection(selection))) }
  catch { /* Filtering remains usable in private mode or when storage is full. */ }
}

// An undefined owner is a saved mine preference waiting for the initial session.
// Account identifiers never enter browser storage; logout/switch clears the preference.
export function resolveMapFilterOwner(owner: string | null | undefined, activeOwner: string | null, authLoading: boolean): string | null | undefined {
  if (owner === undefined) return authLoading ? undefined : activeOwner
  return owner && owner === activeOwner ? owner : null
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
