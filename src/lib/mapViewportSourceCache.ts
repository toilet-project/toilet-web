import type { fetchToiletsInBounds, ToiletMapItemResponse, ToiletMapSearchResponse } from '../api/toilets'
import type { MapSourceCellsResponse } from '../api/mapSourceCells'
import { cellBounds, cellKey, cellsForBounds, type MapBounds, type MapCell } from './mapCells.ts'
import { completeFilterMarker, filterMapMarkers, parseMapFilterInput, type MapFilterInput } from './mapFilters.ts'

type ViewportParams = Parameters<typeof fetchToiletsInBounds>[0]
type SourceEntry = { toilets: ToiletMapItemResponse[]; expires: number; touched: number }
type SnapshotEntry = SourceEntry & { bounds: MapBounds }
type SharedRequest = { controller: AbortController; consumers: Set<symbol>; settled: boolean; abandon: () => void }
type PendingCell = { promise: Promise<SourceEntry>; request: SharedRequest }
type PendingFallback = { promise: Promise<ToiletMapSearchResponse>; request: SharedRequest }
type Options = {
  fetchFallback: typeof fetchToiletsInBounds
  fetchCells: (cells: MapCell[], signal?: AbortSignal) => Promise<MapSourceCellsResponse>
  now?: () => number
}

// A short browser-only freshness window: never persisted or shared across users.
export const MAP_VIEWPORT_SOURCE_TTL_MS = 15_000
const MAX_SOURCE_CELLS = 64
const MAX_SOURCE_MARKERS = 50_000
const MAX_SNAPSHOTS = 4
const MAX_CELL_MARKERS = 25_000

function abortError(): DOMException { return new DOMException('Map source request aborted', 'AbortError') }

function consume<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) {
    void promise.catch(() => {})
    return Promise.reject(signal.reason ?? abortError())
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => { cleanup(); reject(signal.reason ?? abortError()) }
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
  })
}

function consumeShared<T>(promise: Promise<T>, requests: SharedRequest[], signal?: AbortSignal): Promise<T> {
  const consumer = Symbol('map source consumer')
  for (const request of requests) request.consumers.add(consumer)
  return consume(promise, signal).finally(() => {
    for (const request of requests) {
      request.consumers.delete(consumer)
      // A filter replacement in this turn can still join the same public request.
      queueMicrotask(() => {
        if (!request.settled && request.consumers.size === 0 && !request.controller.signal.aborted) {
          request.abandon()
          request.controller.abort(abortError())
        }
      })
    }
  })
}

function contains(outer: MapBounds, inner: MapBounds): boolean {
  return outer.south <= inner.south && outer.north >= inner.north
    && outer.west <= inner.west && outer.east >= inner.east
}

function inside(marker: ToiletMapItemResponse, bounds: MapBounds): boolean {
  return marker.latitude >= bounds.south && marker.latitude <= bounds.north
    && marker.longitude >= bounds.west && marker.longitude <= bounds.east
}

function completeMarkers(value: unknown, bounds: MapBounds): value is ToiletMapItemResponse[] {
  if (!Array.isArray(value) || value.length > MAX_CELL_MARKERS) return false
  const ids = new Set<number>()
  return value.every(marker => {
    if (!marker || !Number.isSafeInteger(marker.id) || marker.id < 1 || ids.has(marker.id)
      || typeof marker.name !== 'string' || !Number.isFinite(marker.latitude) || !Number.isFinite(marker.longitude)
      || !inside(marker, bounds) || !completeFilterMarker(marker)) return false
    ids.add(marker.id)
    return true
  })
}

// Store only the public marker contract, including the names needed after a locale switch.
function copyMarker(marker: ToiletMapItemResponse): ToiletMapItemResponse {
  const result: ToiletMapItemResponse = { id: marker.id, name: marker.name,
    latitude: marker.latitude, longitude: marker.longitude, filterFlags: marker.filterFlags, filterSchema: marker.filterSchema }
  if (typeof marker.toiletType === 'string') result.toiletType = marker.toiletType
  if (Number.isSafeInteger(marker.displayGroupId)) result.displayGroupId = marker.displayGroupId
  if (typeof marker.displayGroupName === 'string') result.displayGroupName = marker.displayGroupName
  const names: NonNullable<ToiletMapItemResponse['translations']> = {}
  if (marker.translations && typeof marker.translations === 'object' && !Array.isArray(marker.translations)) {
    for (const [locale, text] of Object.entries(marker.translations)) {
      if (!/^[a-z]{2,3}(?:-[a-zA-Z]{2})?$/.test(locale) || !text || typeof text !== 'object' || Array.isArray(text)) continue
      if (typeof text.name === 'string' && text.name.trim()) names[locale] = { name: text.name.trim(), roadAddress: null, jibunAddress: null }
    }
  }
  const groupNames: Record<string, string> = {}
  if (marker.displayGroupTranslations && typeof marker.displayGroupTranslations === 'object' && !Array.isArray(marker.displayGroupTranslations)) {
    for (const [locale, name] of Object.entries(marker.displayGroupTranslations)) {
      if (/^[a-z]{2,3}(?:-[a-zA-Z]{2})?$/.test(locale) && typeof name === 'string' && name.trim()) groupNames[locale] = name.trim()
    }
  }
  if (Object.keys(names).length) result.translations = names
  if (Object.keys(groupNames).length) result.displayGroupTranslations = groupNames
  return result
}

function localResponse(markers: ToiletMapItemResponse[], input: MapFilterInput): ToiletMapSearchResponse {
  const response = filterMapMarkers(markers, input)
  return { ...response, toilets: response.toilets.map(copyMarker) }
}

export function createMapViewportClient({ fetchFallback, fetchCells, now = Date.now }: Options) {
  const cells = new Map<string, SourceEntry>()
  const snapshots = new Map<string, SnapshotEntry>()
  const pendingCells = new Map<string, PendingCell>()
  const pendingFallbacks = new Map<string, PendingFallback>()
  const controllers = new Set<AbortController>()
  let epoch = 0
  let touch = 0
  let disposed = false

  function assertEpoch(start: number) {
    if (disposed || epoch !== start) throw abortError()
  }

  function trim() {
    const current = now()
    for (const [key, value] of cells) if (value.expires <= current) cells.delete(key)
    for (const [key, value] of snapshots) if (value.expires <= current) snapshots.delete(key)
    const oldest = <T extends SourceEntry>(map: Map<string, T>) => [...map].sort((a, b) => a[1].touched - b[1].touched)[0]
    while (cells.size > MAX_SOURCE_CELLS) cells.delete(oldest(cells)[0])
    while (snapshots.size > MAX_SNAPSHOTS) snapshots.delete(oldest(snapshots)[0])
    let count = [...cells.values(), ...snapshots.values()].reduce((sum, entry) => sum + entry.toilets.length, 0)
    while (count > MAX_SOURCE_MARKERS) {
      const a = oldest(cells)
      const b = oldest(snapshots)
      const map = a && (!b || a[1].touched <= b[1].touched) ? cells : snapshots
      const entry = map === cells ? a : b
      if (!entry) break
      map.delete(entry[0])
      count -= entry[1].toilets.length
    }
  }

  function requestCells(requested: MapCell[], start: number) {
    const missing = requested.filter(cell => !cells.has(cellKey(cell)) && !pendingCells.has(cellKey(cell)))
    if (missing.length) {
      const controller = new AbortController()
      controllers.add(controller)
      const request: SharedRequest = { controller, consumers: new Set(), settled: false, abandon: () => {
        for (const cell of missing) {
          const key = cellKey(cell)
          if (pendingCells.get(key)?.request === request) pendingCells.delete(key)
        }
      } }
      const expected = new Set(missing.map(cellKey))
      const batch = Promise.resolve().then(() => {
        assertEpoch(start)
        return fetchCells(missing, controller.signal)
      }).then(payload => {
        assertEpoch(start)
        if (controller.signal.aborted) throw abortError()
        if (payload.schema !== 3 || !Array.isArray(payload.cells) || payload.cells.length !== missing.length)
          throw new Error('Incomplete map source cells')
        const found = new Map<string, ToiletMapItemResponse[]>()
        let markerCount = 0
        for (const item of payload.cells) {
          if (!item || !item.cell || !Number.isSafeInteger(item.cell.x) || !Number.isSafeInteger(item.cell.y))
            throw new Error('Invalid map source cell')
          const key = cellKey(item.cell)
          if (!expected.has(key) || found.has(key) || !completeMarkers(item.toilets, cellBounds(item.cell)))
            throw new Error('Invalid map source cell markers')
          markerCount += item.toilets.length
          if (markerCount > MAX_SOURCE_MARKERS) throw new Error('Map source cells too large')
          found.set(key, item.toilets.map(copyMarker))
        }
        // Validate the whole batch before storing any cell: partial responses are never coverage.
        const expires = now() + MAP_VIEWPORT_SOURCE_TTL_MS
        const entries = new Map<string, SourceEntry>()
        for (const [key, toilets] of found) {
          const entry = { toilets, expires, touched: ++touch }
          entries.set(key, entry)
          cells.set(key, entry)
        }
        trim()
        return entries
      }).finally(() => { request.settled = true; controllers.delete(controller) })
      for (const cell of missing) {
        const key = cellKey(cell)
        const pending: PendingCell = { request, promise: batch.then(found => found.get(key)!)
          .finally(() => { if (pendingCells.get(key) === pending) pendingCells.delete(key) }) }
        pendingCells.set(key, pending)
      }
    }
    const requests = new Set<SharedRequest>()
    const promise = Promise.all(requested.map(cell => {
      const key = cellKey(cell)
      const cached = cells.get(key)
      if (cached) { cached.touched = ++touch; return cached }
      const pending = pendingCells.get(key)!
      requests.add(pending.request)
      return pending.promise
    })).then(groups => { assertEpoch(start); return groups })
    return { promise, requests: [...requests] }
  }

  function rememberSnapshot(input: MapFilterInput, response: ToiletMapSearchResponse) {
    if (input.filterFlags !== 0 || input.likedIds !== undefined || response.meta.display_type !== 'MARKER'
      || response.meta.total_count !== response.toilets.length || response.meta.result_count !== response.toilets.length
      || response.clusters.length || !completeMarkers(response.toilets, input.bounds)) return
    const key = JSON.stringify(input.bounds)
    snapshots.set(key, { bounds: { ...input.bounds }, toilets: response.toilets.map(copyMarker),
      expires: now() + MAP_VIEWPORT_SOURCE_TTL_MS, touched: ++touch })
    trim()
  }

  async function fallback(params: ViewportParams, input: MapFilterInput | null, start: number, signal?: AbortSignal) {
    // Private fallbacks must never enter a shared promise or result map.
    if (!input || input.filterFlags !== 0 || input.likedIds !== undefined) return fetchFallback(params, signal)
    const key = JSON.stringify([input.bounds, input.zoom, input.includeList])
    let pending = pendingFallbacks.get(key)
    if (!pending) {
      const controller = new AbortController()
      controllers.add(controller)
      const request: SharedRequest = { controller, consumers: new Set(), settled: false, abandon: () => {
        if (pendingFallbacks.get(key)?.request === request) pendingFallbacks.delete(key)
      } }
      pending = { request, promise: Promise.resolve().then(() => { assertEpoch(start); return fetchFallback(params, controller.signal) })
        .then(response => {
          assertEpoch(start)
          if (controller.signal.aborted) throw abortError()
          rememberSnapshot(input, response)
          return response
        })
        .finally(() => {
          request.settled = true
          controllers.delete(controller)
          if (pendingFallbacks.get(key) === pending) pendingFallbacks.delete(key)
        }) }
      pendingFallbacks.set(key, pending)
    }
    return consumeShared(pending.promise, [pending.request], signal)
  }

  return {
    async fetch(params: ViewportParams, signal?: AbortSignal): Promise<ToiletMapSearchResponse> {
      if (disposed || signal?.aborted) throw signal?.reason ?? abortError()
      const start = epoch
      const input = parseMapFilterInput(params)
      trim()
      // Keep overview aggregation and oversized viewports on their bounded server path.
      const requested = input && input.zoom < 10 ? cellsForBounds(input.bounds) : null
      if (!input || !requested) return fallback(params, input, start, signal)
      if (input.likedIds?.length === 0) return localResponse([], input)
      const covering = [...snapshots.values()].find(snapshot => contains(snapshot.bounds, input.bounds))
      if (covering) { covering.touched = ++touch; return localResponse(covering.toilets, input) }
      const allCached = requested.every(cell => cells.has(cellKey(cell)))
      const someSource = requested.some(cell => cells.has(cellKey(cell)) || pendingCells.has(cellKey(cell)))
      const needsFilters = input.filterFlags !== 0 || input.likedIds !== undefined
      if (allCached || someSource || needsFilters) {
        // A nearby cached cell can expire while another cell is being downloaded.
        // Check freshness at delivery, rather than extending that old cell's lifetime.
        for (let attempt = 0; attempt < 2; attempt++) {
          const source = requestCells(requested, start)
          const entries = await consumeShared(source.promise, source.requests, signal)
          assertEpoch(start)
          if (entries.every(entry => entry.expires > now())) return localResponse(entries.flatMap(entry => entry.toilets), input)
          trim()
        }
        return fallback(params, input, start, signal)
      }
      // Do not add an extra source download to an ordinary first map visit.
      return fallback(params, input, start, signal)
    },
    clear() {
      epoch++
      for (const controller of controllers) controller.abort(abortError())
      controllers.clear()
      cells.clear()
      snapshots.clear()
      pendingCells.clear()
      pendingFallbacks.clear()
    },
    dispose() { this.clear(); disposed = true },
  }
}
