import { createNavigationFetch, MAP_NAVIGATION_EVENT, mapNavigationPath, recordNavigationDiagnostic } from './lib/navigationCache'

const version = process.env.NEXT_PUBLIC_APP_VERSION || 'development'
// Installed synchronously before hydration and Next router prefetch/navigation.
window.fetch = createNavigationFetch(window.fetch.bind(window), window.location.origin, version)
recordNavigationDiagnostic({ kind: 'document-start', path: window.location.pathname, version })

export function onRouterTransitionStart(url: string) {
  const path = mapNavigationPath(url, window.location.origin)
  window.dispatchEvent(new CustomEvent(MAP_NAVIGATION_EVENT, { detail: path }))
  recordNavigationDiagnostic({ kind: 'route-start', path: path ?? '/non-map', version })
}
