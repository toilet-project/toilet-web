// Temporary, synthetic-data-only acceptance backend. Never enabled by a browser parameter.
const prefix = '/__review-verification'
export async function reviewVerificationResponse(request, env) {
  const url = new URL(request.url)
  if (url.pathname !== prefix && !url.pathname.startsWith(prefix + '/')) return null
  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Content-Type': 'application/json' }
  const reject = (status, code = 'REVIEW_VERIFICATION_UNAVAILABLE') => new Response(JSON.stringify({ error: { code } }), { status, headers })
  if (env.SITE_INDEXABLE !== 'false' || url.hostname !== 'preview.geupddong.com') return reject(404)
  const expires = Date.parse(env.REVIEW_VERIFICATION_EXPIRES_AT ?? '')
  const now = Date.now()
  if (!Number.isFinite(expires) || expires <= now || expires - now > 2 * 60 * 60 * 1000) return reject(410)
  if (!/^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com$/.test(env.REVIEW_VERIFICATION_ORIGIN ?? '')) return reject(503, 'REVIEW_VERIFICATION_CONFIG_INVALID')
  const path = url.pathname.slice(prefix.length)
  const read = request.method === 'GET' && (/^\/api\/v1\/reviews(?:\/me|\/creation-status|\/[1-9]\d*)?$/.test(path)
    || /^\/api\/v1\/toilets(?:\/[1-9]\d*(?:\/reviews(?:\/summary)?)?)?$/.test(path)
    || ['/api/v1/auth/me', '/api/v1/notifications/unread-count'].includes(path))
  const write = (request.method === 'POST' && (/^\/api\/v1\/reviews(?:\/[1-9]\d*\/detach-author)?$/.test(path)))
    || request.method === 'PATCH' && /^\/api\/v1\/reviews\/[1-9]\d*$/.test(path)
  if (!read && !write) return reject(403)
  if (write && request.headers.get('Origin') !== url.origin) return reject(403)
  if (write && !request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return reject(415)
  if (url.search.length > 1000) return reject(400)
  let body
  if (write) {
    // Read with a strict cap; no request/response bodies or coordinates are logged.
    const reader = request.body?.getReader()
    if (!reader) return reject(400)
    const chunks = []; let size = 0
    try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 8192) { await reader.cancel(); return reject(413) } chunks.push(value) } }
    catch { return reject(400) }
    body = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length }
  }
  const forwarded = new Headers({ Accept: 'application/json', 'X-Review-Verification': 'synthetic-only' })
  if (write) forwarded.set('Content-Type', 'application/json')
  const idempotency = request.headers.get('Idempotency-Key')
  if (idempotency && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(idempotency)) forwarded.set('Idempotency-Key', idempotency)
  // In particular: never forward real site Cookie, Authorization, CSRF or user-provided forwarding headers.
  try {
    const result = await fetch(env.REVIEW_VERIFICATION_ORIGIN + path + url.search, { method: request.method, headers: forwarded, body, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(14000) })
    if (result.status >= 300 && result.status < 400) { await result.body?.cancel(); return reject(502) }
    return new Response(result.body, { status: result.status, headers })
  } catch (error) {
    // The forwarding request contains only allowlisted synthetic headers. Never log bodies or URLs.
    console.error('REVIEW_VERIFICATION_FORWARD_FAILED', String(error?.message ?? 'unknown').replace(/https?:\/\/\S+/g, '[url]').slice(0, 160))
    return reject(503, 'REVIEW_VERIFICATION_FORWARD_FAILED')
  }
}
