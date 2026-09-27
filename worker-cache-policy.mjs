// Applied AFTER OpenNext. Its R2/ISR data cache stays enabled; browser/outer CDN
// caches must not retain deployment-bound documents or navigation payloads.
export function protectNavigationResponse(request, response, deploymentId) {
  const type = response.headers.get('content-type') || ''
  if (!['GET', 'HEAD'].includes(request.method)
    || !(type.startsWith('text/html') || type.startsWith('text/x-component') || request.headers.get('RSC') === '1')) return response
  const headers = new Headers(response.headers)
  // OpenNext's deployment-scoped static cache omits this header. Next 16.3
  // Flight no longer carries the fallback build id, so its absence forces an
  // MPA reload. Restore only a missing id from the compiled Worker; preserve
  // existing ids so genuine version mismatches still take the safe fallback.
  if (response.ok && type.startsWith('text/x-component')
    && !headers.has('x-nextjs-deployment-id')
    && typeof deploymentId === 'string' && /^[A-Za-z0-9._-]{1,200}$/.test(deploymentId)) {
    headers.set('x-nextjs-deployment-id', deploymentId)
  }
  for (const name of ['Cache-Control', 'CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control']) {
    headers.set(name, 'private, no-store, max-age=0, must-revalidate')
  }
  headers.set('X-Geupddong-Navigation-Cache', 'no-store-v1')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
