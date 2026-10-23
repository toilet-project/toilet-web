// Local, opt-in preview diagnostics. Never sends performance or visitor data.
type Phase = 'shell-evaluated' | 'route-registered' | 'app-import' | 'app-mounted' | 'sdk-prepare'
  | 'map-create' | 'map-data' | 'marker-group' | 'marker-build' | 'marker-attach'
  | 'marker-total' | 'result-committed' | 'result-frame' | 'account-scope-reset' | 'account-initial-public-preserved' | 'viewport-refresh' | 'visibility-refresh'
type Timing = { phase: Phase; startMs: number; durationMs?: number; visibility?: DocumentVisibilityState }
const samples: Timing[] = []
let active: boolean | undefined, output: HTMLOutputElement | null = null
let longTaskCount = 0, longTaskMs = 0, observer: PerformanceObserver | undefined

export function mapTimingEnabled() {
  if (active !== undefined) return active
  if (typeof window === 'undefined') return false
  try { active = window.location.hostname === 'preview.geupddong.com'
    && new URL(window.location.href).searchParams.get('map-timing') === '1' }
  catch { active = false }
  return active
}

const rounded = (value: number) => Math.round(value * 10) / 10
function publish() {
  if (!output) return
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const paints = performance.getEntriesByType('paint')
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    // Group by a fixed category. Do not retain URLs, query strings, coordinates,
    // account details, request bodies, headers, resource names or DOM contents.
    const groups = ['app-script', 'map-sdk', 'map-sdk-config', 'map-tiles', 'map-data', 'region-prefetch'] as const
    const resourceGroups = groups.map(kind => {
      const entries = resources.filter(entry => {
        const path = new URL(entry.name, window.location.origin)
        if (kind === 'app-script') return path.origin === window.location.origin && path.pathname.startsWith('/_next/') && path.pathname.endsWith('.js')
        if (kind === 'map-sdk') return ['dapi.kakao.com', 't1.daumcdn.net', 'oapi.map.naver.com'].includes(path.hostname)
          && (entry.initiatorType === 'script' || path.pathname.endsWith('.js'))
        if (kind === 'map-sdk-config') return path.origin === window.location.origin && path.pathname === '/api/map-provider-config'
        if (kind === 'map-tiles') return entry.initiatorType === 'img' && (/^map\d*\.daumcdn\.net$/.test(path.hostname)
          || ['map.pstatic.net', 'nrbe.map.naver.net'].includes(path.hostname))
        if (kind === 'region-prefetch') return path.origin === window.location.origin && /^(?:\/[a-z-]+)?\/regions$/.test(path.pathname)
        return (path.origin === window.location.origin && ['/api/map-area', '/api/map-filter-area', '/api/map-source-cells', '/api/map-clusters'].includes(path.pathname))
          || (path.hostname === 'api.geupddong.com' && path.pathname === '/api/v1/toilets')
      })
      return { kind, count: entries.length, transferBytes: entries.reduce((sum, entry) => sum + entry.transferSize, 0),
        firstStartMs: entries.length ? rounded(Math.min(...entries.map(entry => entry.startTime))) : null,
        lastEndMs: entries.length ? rounded(Math.max(...entries.map(entry => entry.responseEnd))) : null,
        totalDurationMs: rounded(entries.reduce((sum, entry) => sum + entry.duration, 0)) }
    })
    output.textContent = JSON.stringify({ schema: 1, samples,
      navigation: nav ? { ttfbMs: rounded(nav.responseStart), htmlEndMs: rounded(nav.responseEnd),
        domInteractiveMs: rounded(nav.domInteractive) } : null,
      firstContentfulPaintMs: paints.find(entry => entry.name === 'first-contentful-paint')?.startTime ?? null,
      longTasks: { count: longTaskCount, totalMs: rounded(longTaskMs) }, resourceGroups })
  } catch { /* Diagnostics must never affect the map. */ }
}

function record(phase: Phase, start: number, duration?: number) {
  if (!mapTimingEnabled()) return
  samples.push({ phase, startMs: rounded(start), ...(duration === undefined ? {} : { durationMs: rounded(duration) }),
    ...(typeof document === 'undefined' || !document.visibilityState ? {} : { visibility: document.visibilityState }) })
  if (samples.length > 160) samples.shift()
  publish()
}

export function markMapTiming(phase: Phase) {
  if (mapTimingEnabled()) record(phase, performance.now())
}
export function beginMapTiming(phase: Phase): () => void {
  if (!mapTimingEnabled()) return () => {}
  const start = performance.now()
  let ended = false
  return () => { if (!ended) { ended = true; record(phase, start, performance.now() - start) } }
}

export function installMapTimingOutput() {
  if (!mapTimingEnabled() || output) return
  try {
    output = document.createElement('output')
    output.id = 'geupddong-map-timing'
    output.hidden = true
    document.body.append(output)
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) { longTaskCount++; longTaskMs += entry.duration }
        publish()
      })
      observer.observe({ type: 'longtask', buffered: true })
      window.addEventListener('pagehide', () => observer?.disconnect(), { once: true })
    }
    publish()
  } catch { /* Optional browser APIs and DOM access may be unavailable. */ }
}
