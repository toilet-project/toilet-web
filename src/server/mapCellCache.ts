import type { ToiletMapItemResponse } from '../api/toilets'
import { cellBounds, cellKey, cellsForInvalidation, type MapCell } from '../lib/mapCells.ts'
import type { ScopedToiletCacheEvent } from './cacheRevalidation'
import type { R2BucketLike, R2PutOnlyIf } from './sharedToiletCache'

const SCHEMA = 1
const PREFIX = `map-cells/v${SCHEMA}` // Stable across WEB deployments.
const FRESH_MS = 30 * 24 * 60 * 60 * 1000
const STALE_MS = 37 * 24 * 60 * 60 * 1000
const LEASE_MS = 10_000
const MAX_INVALIDATION_CELLS = 16

type State = 'data' | 'loading' | 'invalidated'
type CellRecord = { schema: number; cell: string; revision: number; globalRevision: number;
  state: State; storedAt: number; leaseUntil?: number; data?: ToiletMapItemResponse[] }
type GlobalRecord = { schema: number; revision: number }
type Loaded<T> = { record: T | null; etag: string } | null

export type CellReadResult = { toilets: ToiletMapItemResponse[]; source: 'hit' | 'miss' | 'stale' }
export function mapCellObjectKey(cell: MapCell) { return `${PREFIX}/cells/${cell.y}/${cell.x}.json` }
export function mapCellGlobalKey() { return `${PREFIX}/global.json` }
function condition(current: Loaded<unknown>): R2PutOnlyIf {
  return current ? { etagMatches: current.etag } : { etagDoesNotMatch: '*' }
}
function validGlobal(value: unknown): GlobalRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as GlobalRecord
  return record.schema === SCHEMA && Number.isSafeInteger(record.revision) && record.revision >= 0 ? record : null
}
function validCell(value: unknown, cell: MapCell): CellRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as CellRecord
  if (record.schema !== SCHEMA || record.cell !== cellKey(cell)
    || !Number.isSafeInteger(record.revision) || record.revision < 0
    || !Number.isSafeInteger(record.globalRevision) || record.globalRevision < 0
    || !Number.isSafeInteger(record.storedAt) || record.storedAt < 0
    || !['data', 'loading', 'invalidated'].includes(record.state)) return null
  if (record.data !== undefined && (!Array.isArray(record.data)
    || record.data.some(item => !item || !Number.isSafeInteger(item.id) || item.id < 1
      || typeof item.name !== 'string' || !Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)))) return null
  if (record.state === 'data' && !record.data) return null
  if (record.state === 'loading' && (!Number.isSafeInteger(record.leaseUntil) || record.leaseUntil! < 0)) return null
  return record
}
async function load<T>(bucket: R2BucketLike, key: string, validate: (value: unknown) => T | null): Promise<Loaded<T>> {
  const object = await bucket.get(key)
  if (!object) return null
  return { etag: object.etag, record: validate(await object.json<unknown>()) }
}
function loadGlobal(bucket: R2BucketLike) { return load(bucket, mapCellGlobalKey(), validGlobal) }
function loadCell(bucket: R2BucketLike, cell: MapCell) {
  return load(bucket, mapCellObjectKey(cell), value => validCell(value, cell))
}
async function put(bucket: R2BucketLike, key: string, value: unknown, current: Loaded<unknown>) {
  return bucket.put(key, JSON.stringify(value), { onlyIf: condition(current),
    httpMetadata: { contentType: 'application/json' } })
}
export function sanitizeMapCellOriginResponse(value: unknown, cell: MapCell): ToiletMapItemResponse[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid map cell origin response')
  const response = value as Record<string, unknown>
  const meta = response.meta as Record<string, unknown> | undefined
  if (meta?.display_type !== 'MARKER' || !Array.isArray(response.toilets)) throw new Error('Invalid map cell origin response')
  const bounds = cellBounds(cell)
  return response.toilets.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid map cell marker')
    const marker = raw as Record<string, unknown>
    if (!Number.isSafeInteger(marker.id) || Number(marker.id) < 1 || typeof marker.name !== 'string'
      || !Number.isFinite(marker.latitude) || !Number.isFinite(marker.longitude)
      || Number(marker.latitude) < bounds.south || Number(marker.latitude) > bounds.north
      || Number(marker.longitude) < bounds.west || Number(marker.longitude) > bounds.east) throw new Error('Invalid map cell marker')
    // Cache only the public marker contract. Unknown API fields cannot enter R2.
    const names: NonNullable<ToiletMapItemResponse['translations']> = {}
    if (marker.translations && typeof marker.translations === 'object' && !Array.isArray(marker.translations)) {
      for (const [locale, text] of Object.entries(marker.translations)) {
        if (!/^[a-z]{2,3}(?:-[a-zA-Z]{2})?$/.test(locale)
          || !text || typeof text !== 'object' || Array.isArray(text)) continue
        const name = (text as Record<string, unknown>).name
        if (typeof name === 'string' && name.trim()) names[locale] = { name: name.trim(), roadAddress: null, jibunAddress: null }
      }
    }
    const groupNames: Record<string, string> = {}
    if (marker.displayGroupTranslations && typeof marker.displayGroupTranslations === 'object'
      && !Array.isArray(marker.displayGroupTranslations)) {
      for (const [locale, name] of Object.entries(marker.displayGroupTranslations)) {
        if (/^[a-z]{2,3}(?:-[a-zA-Z]{2})?$/.test(locale) && typeof name === 'string' && name.trim())
          groupNames[locale] = name.trim()
      }
    }
    return { id: marker.id as number, name: marker.name,
      toiletType: typeof marker.toiletType === 'string' ? marker.toiletType : undefined,
      latitude: marker.latitude as number, longitude: marker.longitude as number,
      displayGroupId: Number.isSafeInteger(marker.displayGroupId) ? marker.displayGroupId as number : null,
      displayGroupName: typeof marker.displayGroupName === 'string' ? marker.displayGroupName : null,
      displayGroupTranslations: Object.keys(groupNames).length ? groupNames : undefined,
      translations: Object.keys(names).length ? names : undefined }
  })
}

export async function fetchMapCellOrigin(cell: MapCell): Promise<ToiletMapItemResponse[]> {
  const origin = process.env.TOILET_API_ORIGIN ?? 'https://api.geupddong.com'
  const bounds = cellBounds(cell)
  const query = new URLSearchParams({ southLat: String(bounds.south), northLat: String(bounds.north),
    westLng: String(bounds.west), eastLng: String(bounds.east) })
  const compactUrl = `${origin.replace(/\/$/, '')}/api/v1/toilets/map-cell?${query}`
  let response = await fetch(compactUrl, {
    cache: 'no-store', signal: AbortSignal.timeout(8_000),
  })
  // During the API/WEB rollout the old API remains a safe public read fallback.
  if (response.status === 404) {
    query.set('zoom', '8')
    query.set('includeList', 'false')
    response = await fetch(`${origin.replace(/\/$/, '')}/api/v1/toilets?${query}`, {
      cache: 'no-store', signal: AbortSignal.timeout(8_000),
    })
  }
  if (!response.ok) throw new Error(`Map cell origin HTTP ${response.status}`)
  return sanitizeMapCellOriginResponse(await response.json(), cell)
}

export async function readThroughMapCell(options: { bucket: R2BucketLike; cell: MapCell;
  fetchOrigin?: () => Promise<ToiletMapItemResponse[]>; now?: () => number;
  pause?: (milliseconds: number) => Promise<void> }): Promise<CellReadResult> {
  const { bucket, cell } = options
  const now = options.now ?? Date.now
  const fetchOrigin = options.fetchOrigin ?? (() => fetchMapCellOrigin(cell))
  const pause = options.pause ?? (milliseconds => new Promise<void>(resolve => setTimeout(resolve, milliseconds)))
  for (let attempt = 0; attempt < 90; attempt++) {
    const global = await loadGlobal(bucket)
    const globalRevision = global?.record?.revision ?? 0
    const current = await loadCell(bucket, cell)
    const record = current?.record
    const sameGeneration = record?.globalRevision === globalRevision
    if (record?.state === 'data' && sameGeneration && record.storedAt + FRESH_MS > now()) {
      if (((await loadGlobal(bucket))?.record?.revision ?? 0) === globalRevision)
        return { toilets: record.data!, source: 'hit' }
      continue
    }
    if (record?.state === 'loading' && sameGeneration && record.leaseUntil! > now()) {
      // One isolate owns the cold miss. Waiters must not stampede the mini PC.
      if (record.data && record.storedAt + STALE_MS > now()
        && ((await loadGlobal(bucket))?.record?.revision ?? 0) === globalRevision)
        return { toilets: record.data, source: 'stale' }
      await pause(100)
      continue
    }
    const lease: CellRecord = { schema: SCHEMA, cell: cellKey(cell), revision: (record?.revision ?? 0) + 1,
      globalRevision, state: 'loading', storedAt: record?.storedAt ?? now(), leaseUntil: now() + LEASE_MS,
      ...(sameGeneration && record?.state === 'data' && record.data ? { data: record.data } : {}) }
    const acquired = await put(bucket, mapCellObjectKey(cell), lease, current)
    if (!acquired) continue
    try {
      const data = await fetchOrigin()
      const fresh: CellRecord = { schema: SCHEMA, cell: cellKey(cell), revision: lease.revision,
        globalRevision, state: 'data', storedAt: now(), data }
      const written = await put(bucket, mapCellObjectKey(cell), fresh, { record: lease, etag: acquired.etag })
      if (written) {
        const latestGlobal = await loadGlobal(bucket)
        if ((latestGlobal?.record?.revision ?? 0) === globalRevision)
          return { toilets: data, source: 'miss' }
      }
      // Invalidation won the race. Never return an old origin snapshot.
    } catch (error) {
      const expired: CellRecord = { schema: SCHEMA, cell: cellKey(cell), revision: lease.revision,
        globalRevision, state: 'invalidated', storedAt: now() }
      const restored = await put(bucket, mapCellObjectKey(cell), expired, { record: lease, etag: acquired.etag })
      if (!restored) continue
      if (lease.data && lease.storedAt + STALE_MS > now()
        && ((await loadGlobal(bucket))?.record?.revision ?? 0) === globalRevision)
        return { toilets: lease.data, source: 'stale' }
      throw error
    }
  }
  throw new Error('Map cell cache contention')
}

async function invalidateCell(bucket: R2BucketLike, cell: MapCell, now: () => number) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await loadCell(bucket, cell)
    const record = current?.record
    const next: CellRecord = { schema: SCHEMA, cell: cellKey(cell), revision: (record?.revision ?? 0) + 1,
      globalRevision: record?.globalRevision ?? 0, state: 'invalidated', storedAt: now() }
    if (await put(bucket, mapCellObjectKey(cell), next, current)) return
  }
  throw new Error('Map cell invalidation contention')
}

async function advanceGlobal(bucket: R2BucketLike) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await loadGlobal(bucket)
    const next: GlobalRecord = { schema: SCHEMA, revision: (current?.record?.revision ?? 0) + 1 }
    if (await put(bucket, mapCellGlobalKey(), next, current)) return
  }
  throw new Error('Map cell global invalidation contention')
}

export async function invalidateMapCells(bucket: R2BucketLike, events: ScopedToiletCacheEvent[], now = Date.now) {
  const cells = new Map<string, MapCell>()
  for (const event of events) {
    if (!event.regionScopeComplete) { await advanceGlobal(bucket); return 'global' as const }
    const affected = cellsForInvalidation(event.regionBounds, MAX_INVALIDATION_CELLS)
    if (!affected) { await advanceGlobal(bucket); return 'global' as const }
    for (const cell of affected) cells.set(cellKey(cell), cell)
    if (cells.size > MAX_INVALIDATION_CELLS) { await advanceGlobal(bucket); return 'global' as const }
  }
  const pending = [...cells.values()]
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
    while (cursor < pending.length) await invalidateCell(bucket, pending[cursor++], now)
  }))
  return 'scoped' as const
}

export async function getMapCellBucket(): Promise<R2BucketLike | null> {
  if (process.env.CACHE_RUNTIME !== 'workers') return null
  const { getCloudflareContext } = await import('@opennextjs/cloudflare')
  const { env } = await getCloudflareContext({ async: true })
  const bucket = (env as Record<string, unknown>).PUBLIC_TOILET_DATA_CACHE_R2
  if (!bucket) throw new Error('Map cell R2 binding unavailable')
  return bucket as R2BucketLike
}

export async function persistMapCellInvalidation(events: ScopedToiletCacheEvent[] | null) {
  if (process.env.MAP_CELL_CACHE_ENABLED !== 'true') return
  const bucket = await getMapCellBucket()
  if (!bucket) return
  if (events === null) await advanceGlobal(bucket)
  else await invalidateMapCells(bucket, events)
}
