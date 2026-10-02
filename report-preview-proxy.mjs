// No production route, account cookies, administration routes or cache writes.
export async function reportPreviewResponse(request, env) {
  const url = new URL(request.url), prefix = '/__report-preview'
  if (url.pathname !== prefix && !url.pathname.startsWith(prefix + '/')) return null
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }
  const fail = (status, code = 'REPORT_PREVIEW_UNAVAILABLE') => new Response(JSON.stringify({ error: { code } }), { status, headers })
  if (env.SITE_INDEXABLE !== 'false' || url.hostname !== 'preview.geupddong.com') return fail(404)
  if (request.method !== 'POST' || url.pathname !== prefix + '/api/v1/reports/guest' || url.search) return fail(403)
  if (request.headers.get('Origin') !== url.origin) return fail(403, 'ORIGIN_DENIED')
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return fail(415)
  let connection
  try { connection = JSON.parse(env.REPORT_PREVIEW_CONNECTION) } catch { return fail(503) }
  const expires = Date.parse(connection.expiresAt)
  if (!Number.isFinite(expires) || expires <= Date.now() || expires - Date.now() > 2 * 3600000) return fail(410)
  if (!/^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com$/.test(connection.origin) || !/^[a-f0-9]{64}$/.test(connection.token)) return fail(503)
  const forwarded = { 'Content-Type': 'application/json', 'X-Report-Preview-Key': connection.token }
  for (const key of ['Idempotency-Key', 'X-Report-Guest']) {
    const value = request.headers.get(key)
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value || '')) return fail(400)
    forwarded[key] = value
  }
  const reader = request.body?.getReader()
  if (!reader) return fail(400)
  const chunks = []; let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break
      size += value.length; if (size > 8192) { await reader.cancel(); return fail(413) }
      chunks.push(value)
    }
    const body = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length }
    const response = await fetch(connection.origin + '/api/v1/reports/guest', { method: 'POST', headers: forwarded, body, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(25000) })
    if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); return fail(502) }
    return new Response(response.body, { status: response.status, headers })
  } catch { return fail(503) }
}
