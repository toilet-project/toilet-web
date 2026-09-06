export const MAP_RESUME_KEY = 'geupddong.update-map-resume.v1'
export const UPDATE_CHECK_INTERVAL = 5 * 60_000
export const RESUME_TTL = 5 * 60_000
type Point = { latitude: number; longitude: number }
export type MapResume = {
  path: string; center: Point; level: number; reference: Point
  source: 'point' | 'current-location'; currentLocation: Point | null; expanded: boolean; savedAt: number
}
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function validAppVersion(value: unknown): value is string {
  return typeof value === 'string' && value !== 'development' && /^[a-zA-Z0-9_-]{1,160}$/.test(value)
}
function point(value: unknown): value is Point {
  if (!value || typeof value !== 'object') return false
  const p = value as Point
  return Number.isFinite(p.latitude) && p.latitude >= -90 && p.latitude <= 90
    && Number.isFinite(p.longitude) && p.longitude >= -180 && p.longitude <= 180
}
export function parseMapResume(raw: string | null, path: string, now = Date.now()): MapResume | null {
  try {
    if (!raw || raw.length > 1500) return null
    const v = JSON.parse(raw) as MapResume
    if (!v || v.path !== path || !/^\/(?:toilet\/[1-9]\d*)?$/.test(v.path)
      || !Number.isFinite(v.savedAt) || now < v.savedAt || now - v.savedAt > RESUME_TTL
      || !point(v.center) || !point(v.reference) || !Number.isInteger(v.level) || v.level < 1 || v.level > 14
      || !['point', 'current-location'].includes(v.source) || typeof v.expanded !== 'boolean'
      || (v.currentLocation !== null && !point(v.currentLocation))) return null
    // Explicit allowlist; never restore credentials, account details, or arbitrary state.
    const copy = (p: Point) => ({ latitude: p.latitude, longitude: p.longitude })
    return { path: v.path, savedAt: v.savedAt, center: copy(v.center), reference: copy(v.reference), level: v.level,
      source: v.source, currentLocation: v.currentLocation && copy(v.currentLocation), expanded: v.expanded }
  } catch { return null }
}
export function readMapResume(storage: Store, path: string): MapResume | null {
  try {
    const value = parseMapResume(storage.getItem(MAP_RESUME_KEY), path)
    if (!value) storage.removeItem(MAP_RESUME_KEY)
    return value
  } catch { return null }
}
export function saveMapResume(storage: Store, value: MapResume): boolean {
  try {
    const safe = parseMapResume(JSON.stringify(value), value.path)
    if (!safe) return false
    storage.setItem(MAP_RESUME_KEY, JSON.stringify(safe))
    return true
  } catch { return false }
}

// One in-flight request, throttled across focus/pageshow/timer events. No retries/reloads on errors.
export function createVersionCheck(current: string, notify: (version: string) => void,
  request: typeof fetch = fetch, now = Date.now) {
  let lastCheck = -Infinity
  let controller: AbortController | null = null
  let stopped = false
  return {
    async check() {
      if (stopped || !validAppVersion(current) || controller || now() - lastCheck < UPDATE_CHECK_INTERVAL) return
      lastCheck = now()
      controller = new AbortController()
      const active = controller
      const timeout = setTimeout(() => active.abort(), 10_000)
      try {
        const response = await request('/version.json', { cache: 'no-store', credentials: 'omit', signal: active.signal })
        if (!response.ok) return
        const data = await response.json() as { version?: unknown }
        if (!stopped && !active.signal.aborted && validAppVersion(data?.version) && data.version !== current) notify(data.version)
      } catch { /* Offline/version-check failure must not disrupt the map. */ }
      finally { clearTimeout(timeout); controller = null }
    },
    dispose() { stopped = true; controller?.abort() },
  }
}
