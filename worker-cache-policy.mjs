// Applied AFTER OpenNext. Its R2/ISR data cache stays enabled; browser/outer CDN
// caches must not retain deployment-bound documents or navigation payloads.
export function protectNavigationResponse(request, response) {
  const type = response.headers.get('content-type') || ''
  if (!['GET', 'HEAD'].includes(request.method)
    || !(type.startsWith('text/html') || type.startsWith('text/x-component') || request.headers.get('RSC') === '1')) return response
  const headers = new Headers(response.headers)
  for (const name of ['Cache-Control', 'CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control']) {
    headers.set(name, 'private, no-store, max-age=0, must-revalidate')
  }
  headers.set('X-Geupddong-Navigation-Cache', 'no-store-v1')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
