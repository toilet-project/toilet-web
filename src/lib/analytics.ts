import { createApiUrl } from '../config/api.ts'

const eventParameters = {
  screen_view: ['screen'],
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
export type AnalyticsAcquisition = { referrerHost?: string; utmSource?: string; utmMedium?: string }

export function sanitizeAnalyticsPagePath(pathname: string) {
  const raw = pathname.split(/[?#]/, 1)[0] || '/'
  const path = raw.length > 1 ? raw.replace(/\/+$/, '') : raw
  if (path === '/') return '/'
  if (/^\/toilet\/\d+$/.test(path) || path === '/toilet/:id') return '/toilet/:id'
  if (/^\/policies\/(terms|privacy|location|all)$/.test(path)) return path
  return '/other'
}

function attributionValue(value: string | null | undefined, maximum: number) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized.length <= maximum && /^[a-z0-9._+-]+$/.test(normalized) ? normalized : undefined
}

function referrerHostValue(value: string | null | undefined) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized.length <= 120 && /^[a-z0-9.-]+$/.test(normalized) ? normalized : undefined
}

export function buildAnalyticsAcquisition(locationHref: string, documentReferrer: string): AnalyticsAcquisition {
  let referrerHost: string | undefined
  try {
    const host = documentReferrer ? new URL(documentReferrer).hostname.toLowerCase() : ''
    referrerHost = referrerHostValue(host)
  } catch { /* A malformed or privacy-reduced referrer is treated as unavailable. */ }

  try {
    const params = new URL(locationHref).searchParams
    return {
      referrerHost,
      utmSource: attributionValue(params.get('utm_source'), 40),
      utmMedium: attributionValue(params.get('utm_medium'), 24),
    }
  } catch {
    return { referrerHost }
  }
}

export function resolveAnalyticsAcquisition(
  stored: string | null,
  locationHref: string,
  documentReferrer: string,
): AnalyticsAcquisition {
  if (stored !== null) {
    try {
      const parsed = JSON.parse(stored) as AnalyticsAcquisition
      return {
        referrerHost: referrerHostValue(parsed.referrerHost),
        utmSource: attributionValue(parsed.utmSource, 40),
        utmMedium: attributionValue(parsed.utmMedium, 24),
      }
    } catch { /* A broken storage value starts a fresh attribution below. */ }
  }
  return buildAnalyticsAcquisition(locationHref, documentReferrer)
}

export function sanitizeAnalyticsParameters(name: AnalyticsEventName, parameters: AnalyticsParameters = {}) {
  const allowed = new Set<string>(eventParameters[name])
  const safe: AnalyticsParameters = {}
  for (const [key, raw] of Object.entries(parameters)) {
    if (!allowed.has(key) || raw === undefined) continue
    if (typeof raw === 'boolean') safe[key] = raw
    else if (typeof raw === 'number' && Number.isFinite(raw)) safe[key] = Math.max(0, Math.min(3600, raw))
    else if (typeof raw === 'string' && /^[a-z0-9_+-]{1,40}$/i.test(raw)) safe[key] = raw.toLowerCase()
  }
  return safe
}

export function buildAnalyticsPayload(name: AnalyticsEventName | 'page_view' | 'session_start' | 'engagement', parameters: AnalyticsParameters = {}) {
  const safe = name === 'page_view' || name === 'session_start' || name === 'engagement'
    ? parameters : sanitizeAnalyticsParameters(name, parameters)
  return {
    event: name,
    path: sanitizeAnalyticsPagePath(String(safe.path || (typeof window === 'undefined' ? '/' : window.location.pathname))),
    source: typeof safe.source === 'string' ? safe.source : undefined,
    resultCountBucket: typeof safe.result_count_bucket === 'string'
      ? safe.result_count_bucket.replaceAll('_', '-') : undefined,
    engagementSeconds: name === 'engagement' ? Number(safe.engagement_seconds || 0) : undefined,
    scrollPercent: name === 'scroll_depth' ? Number(safe.percent || 0) : undefined,
    detail: eventDetail(name, safe),
    success: typeof safe.success === 'boolean' ? safe.success : undefined,
  }
}

const SESSION_KEY = 'geupddong.analytics-session.v1'
const VISITOR_KEY = 'geupddong.analytics-visitor.v1'
const ACQUISITION_KEY = 'geupddong.analytics-acquisition.v1'

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('')
  }
  return ''
}

function sessionId() {
  try {
    const current = window.sessionStorage.getItem(SESSION_KEY)
    if (current) return current
    const created = randomId()
    if (created) window.sessionStorage.setItem(SESSION_KEY, created)
    return created
  } catch {
    return randomId()
  }
}

function claimNewVisitor() {
  try {
    if (window.localStorage.getItem(VISITOR_KEY)) return false
    window.localStorage.setItem(VISITOR_KEY, '1')
    return true
  } catch {
    return false
  }
}

function acquisition(): AnalyticsAcquisition {
  const initial = () => resolveAnalyticsAcquisition(null, window.location.href, document.referrer)
  try {
    const current = window.sessionStorage.getItem(ACQUISITION_KEY)
    const created = resolveAnalyticsAcquisition(current, window.location.href, document.referrer)
    if (current !== null) return created
    window.sessionStorage.setItem(ACQUISITION_KEY, JSON.stringify(created))
    return created
  } catch {
    return initial()
  }
}

function eventDetail(name: string, safe: AnalyticsParameters) {
  const key = name === 'screen_view' ? 'screen'
    : name === 'toilet_search' ? 'query_kind'
    : name === 'nearby_search' ? 'permission_state'
      : name === 'search_result_select' ? 'rank_bucket'
        : name === 'toilet_marker_select' ? 'zoom_bucket'
          : name === 'directions_click' || name === 'login_result' ? 'provider'
            : name === 'report_submit' ? 'report_kind' : ''
  return key && typeof safe[key] === 'string' ? safe[key] : undefined
}

type AnalyticsPayload = ReturnType<typeof buildAnalyticsPayload> & { newVisitor?: boolean }

function send(payload: AnalyticsPayload) {
  if (typeof window === 'undefined') return
  void fetch(createApiUrl('/api/v1/analytics/events'), {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, ...acquisition(), sessionId: sessionId() }),
  }).catch(() => undefined)
}

export function trackPageView(pathname: string) {
  send(buildAnalyticsPayload('page_view', { path: pathname }))
}

export function trackSessionStart(pathname: string) {
  send({ ...buildAnalyticsPayload('session_start', { path: pathname }), newVisitor: claimNewVisitor() })
}

export function trackEngagement(pathname: string, seconds: number) {
  send(buildAnalyticsPayload('engagement', {
    path: pathname,
    engagement_seconds: Math.min(3600, Math.max(0, Math.round(seconds))),
  }))
}

export function trackEvent(name: AnalyticsEventName, parameters: AnalyticsParameters = {}) {
  send(buildAnalyticsPayload(name, parameters))
}

export function resultCountBucket(count: number) {
  if (count <= 0) return '0'
  if (count === 1) return '1'
  if (count <= 5) return '2-5'
  if (count <= 10) return '6-10'
  if (count <= 25) return '11-25'
  return '26+'
}
