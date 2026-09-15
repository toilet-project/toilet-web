export type AnalyticsConsent = 'unknown' | 'granted' | 'denied'

export const ANALYTICS_CONSENT_KEY = 'geupddong.analytics-consent.v1'
export const ANALYTICS_CONSENT_EVENT = 'geupddong:analytics-consent'
export const ANALYTICS_SETTINGS_EVENT = 'geupddong:analytics-settings'

const measurementId = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID?.trim() || ''
const validMeasurementId = /^G-[A-Z0-9]+$/.test(measurementId) ? measurementId : ''
let loading: Promise<void> | null = null

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

export function readAnalyticsConsent(): AnalyticsConsent {
  try {
    const value = window.localStorage.getItem(ANALYTICS_CONSENT_KEY)
    return value === 'granted' || value === 'denied' ? value : 'unknown'
  } catch {
    return 'unknown'
  }
}

export function writeAnalyticsConsent(value: Exclude<AnalyticsConsent, 'unknown'>) {
  try { window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value) } catch { /* The choice remains in memory for this page. */ }
  if (validMeasurementId) (window as unknown as Record<string, unknown>)[`ga-disable-${validMeasurementId}`] = value === 'denied'
  if (window.gtag) window.gtag('consent', 'update', { analytics_storage: value })
  if (value === 'denied') clearAnalyticsCookies()
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: value }))
}

export function openAnalyticsSettings() {
  window.dispatchEvent(new Event(ANALYTICS_SETTINGS_EVENT))
}

export function loadGoogleAnalytics(): Promise<void> {
  if (!validMeasurementId || readAnalyticsConsent() !== 'granted') return Promise.resolve()
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    window.dataLayer = window.dataLayer || []
    // Google tag commands must be queued as the function's Arguments object.
    // The loader does not reliably process a nested array created from rest parameters.
    window.gtag = window.gtag || function () { window.dataLayer?.push(arguments) }
    ;(window as unknown as Record<string, unknown>)[`ga-disable-${validMeasurementId}`] = false
    window.gtag('consent', 'default', {
      analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    })
    window.gtag('js', new Date())
    window.gtag('config', validMeasurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    })
    const existing = document.getElementById('geupddong-ga4') as HTMLScriptElement | null
    if (existing) { resolve(); return }
    const script = document.createElement('script')
    script.id = 'geupddong-ga4'
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(validMeasurementId)}`
    script.onload = () => resolve()
    script.onerror = () => { loading = null; reject(new Error('GA4 script failed to load')) }
    document.head.append(script)
  })
  return loading
}

export function sanitizeAnalyticsPagePath(pathname: string) {
  const path = pathname.split(/[?#]/, 1)[0] || '/'
  if (/^\/toilet\/\d+\/?$/.test(path)) return '/toilet/[id]'
  return path.startsWith('/') ? path.slice(0, 120) : '/'
}

export async function trackPageView(pathname: string, title = document.title) {
  if (readAnalyticsConsent() !== 'granted') return
  await loadGoogleAnalytics().catch(() => undefined)
  if (!window.gtag) return
  const pagePath = sanitizeAnalyticsPagePath(pathname)
  window.gtag('event', 'page_view', {
    page_path: pagePath,
    page_location: `${window.location.origin}${pagePath}`,
    page_title: title.slice(0, 100),
  })
}

const eventParameters = {
  toilet_search: ['query_kind', 'success', 'result_count_bucket'],
  search_result_select: ['rank_bucket'],
  toilet_marker_select: ['zoom_bucket', 'source'],
  toilet_detail_open: ['source'],
  nearby_search: ['permission_state', 'success', 'result_count_bucket'],
  directions_click: ['provider'],
  report_start: ['source'],
  report_submit: ['report_kind', 'success'],
  login_result: ['provider', 'success'],
  review_submit: ['success'],
  scroll_depth: ['percent'],
} as const

export type AnalyticsEventName = keyof typeof eventParameters
export type AnalyticsParameters = Record<string, string | number | boolean | undefined>

export function sanitizeAnalyticsParameters(name: AnalyticsEventName, parameters: AnalyticsParameters = {}) {
  const allowed = new Set<string>(eventParameters[name])
  const safe: AnalyticsParameters = {}
  for (const [key, raw] of Object.entries(parameters)) {
    if (!allowed.has(key) || raw === undefined) continue
    if (typeof raw === 'boolean') safe[key] = raw
    else if (typeof raw === 'number' && Number.isFinite(raw)) safe[key] = Math.max(-10_000, Math.min(10_000, raw))
    else if (typeof raw === 'string' && /^[a-z0-9_-]{1,40}$/i.test(raw)) safe[key] = raw.toLowerCase()
  }
  return safe
}

export function trackEvent(name: AnalyticsEventName, parameters: AnalyticsParameters = {}) {
  if (readAnalyticsConsent() !== 'granted' || !window.gtag) return
  const safe = sanitizeAnalyticsParameters(name, parameters)
  window.gtag('event', name, safe)
}

export function resultCountBucket(count: number) {
  if (count <= 0) return '0'
  if (count === 1) return '1'
  if (count <= 5) return '2_5'
  if (count <= 10) return '6_10'
  return '11_plus'
}

function clearAnalyticsCookies() {
  try {
    for (const item of document.cookie.split(';')) {
      const name = item.split('=', 1)[0]?.trim()
      if (!name || (name !== '_ga' && !name.startsWith('_ga_'))) continue
      for (const domain of ['', `; Domain=${window.location.hostname}`, '; Domain=.geupddong.com']) {
        document.cookie = `${name}=; Max-Age=0; Path=/${domain}; SameSite=Lax; Secure`
      }
    }
  } catch { /* Cookie cleanup is best effort; ga-disable still stops collection. */ }
}
