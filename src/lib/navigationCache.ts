export const MAP_NAVIGATION_EVENT = 'geupddong:map-navigation'
export const NAVIGATION_DIAGNOSTICS_KEY = 'geupddong.navigation-diagnostics.v1'

export function mapNavigationPath(value: string, origin: string): string | null {
  try {
    const url = new URL(value, origin)
    return url.origin === origin && /^\/(?:toilet\/[1-9]\d*)?$/.test(url.pathname) ? url.pathname : null
  } catch { return null }
}

type Diagnostic = { kind: string; path: string; status?: number; version?: string }
export function recordNavigationDiagnostic(event: Diagnostic) {
  try {
    // Local, bounded technical breadcrumbs only: no coordinates, query strings, account or tokens.
    const raw: unknown = JSON.parse(sessionStorage.getItem(NAVIGATION_DIAGNOSTICS_KEY) || '[]')
    const rows = Array.isArray(raw) ? raw.slice(-19) : []
    rows.push({ kind: event.kind, path: event.path.split('?')[0], status: event.status,
      version: event.version, at: Date.now() })
    sessionStorage.setItem(NAVIGATION_DIAGNOSTICS_KEY, JSON.stringify(rows))
  } catch { /* Private mode/storage failure must not affect navigation. */ }
}

export function createNavigationFetch(request: typeof fetch, origin: string, version: string,
  record: (event: Diagnostic) => void = recordNavigationDiagnostic): typeof fetch {
  return async (input, init) => {
    const source = input instanceof Request ? input : null
    const url = new URL(source?.url ?? String(input), origin)
    const headers = new Headers(init?.headers ?? source?.headers)
    const method = (init?.method ?? source?.method ?? 'GET').toUpperCase()
    if (url.origin !== origin || method !== 'GET' || headers.get('RSC') !== '1') return request(input, init)
    // Bypass ALREADY stored browser responses too. Response headers alone cannot do that.
    // Preserve Next's _rsc hash, deployment headers, credentials, priority and abort signal.
    try {
      const response = await request(input, { ...init, cache: 'no-store' })
      const deployment = response.headers.get('x-nextjs-deployment-id')
      if (!response.ok || !response.headers.get('content-type')?.startsWith('text/x-component')) {
        record({ kind: 'rsc-invalid', path: url.pathname, status: response.status, version })
      } else if (deployment && deployment !== version) {
        record({ kind: 'rsc-deployment-change', path: url.pathname, version })
      }
      return response
    } catch (error) {
      record({ kind: init?.signal?.aborted || source?.signal.aborted ? 'rsc-abort' : 'rsc-network-error', path: url.pathname, version })
      throw error
    }
  }
}
