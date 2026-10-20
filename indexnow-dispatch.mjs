export const INDEXNOW_DISPATCH_PATH = '/_internal/indexnow/dispatch'
const encoder = new TextEncoder()
const body = '{}'
function active(env) {
  return env.SITE_INDEXABLE === 'true' && env.INDEXNOW_ENABLED === 'true' && env.INDEXNOW_OUTBOX_ENABLED === 'true'
}
async function signature(secret, timestamp) {
  if (typeof secret !== 'string' || encoder.encode(secret).length < 32) throw new Error('Dispatch signing unavailable')
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const value = encoder.encode(`indexnow-dispatch-v1\nPOST\n${INDEXNOW_DISPATCH_PATH}\n${timestamp}\n${body}`)
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, value)), b => b.toString(16).padStart(2, '0')).join('')
}
export async function createIndexNowDispatchRequest(secret, now = Date.now()) {
  const timestamp = String(Math.floor(now / 1000))
  return new Request(`https://geupddong.com${INDEXNOW_DISPATCH_PATH}`, { method: 'POST', body,
    headers: { 'Content-Type': 'application/json', 'x-indexnow-timestamp': timestamp,
      'x-indexnow-signature': await signature(secret, timestamp) } })
}
export async function verifyIndexNowDispatchRequest(request, secret, now = Date.now()) {
  if (request.method !== 'POST' || new URL(request.url).pathname !== INDEXNOW_DISPATCH_PATH
    || request.headers.get('content-type') !== 'application/json') return false
  const timestamp = request.headers.get('x-indexnow-timestamp') ?? ''
  const given = request.headers.get('x-indexnow-signature') ?? ''
  if (!/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300 || !/^[a-f0-9]{64}$/.test(given)) return false
  const expected = await signature(secret, timestamp)
  let different = 0
  for (let i = 0; i < expected.length; i++) different |= expected.charCodeAt(i) ^ given.charCodeAt(i)
  if (different || Number(request.headers.get('content-length')) > 2 || !request.body) return false
  const reader = request.body.getReader()
  const chunks = []; let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > 2) { await reader.cancel(); return false }
      chunks.push(...result.value)
    }
  } finally { reader.releaseLock() }
  return new TextDecoder().decode(new Uint8Array(chunks)) === body
}
/** Native scheduled events are the only automatic caller; no public unprotected drain endpoint. */
export async function runScheduledIndexNow(env, fetchInternal, now = Date.now()) {
  if (!active(env)) return { state: 'disabled' }
  const response = await fetchInternal(await createIndexNowDispatchRequest(env.CACHE_REVALIDATION_SECRET, now))
  if (!response.ok) throw new Error(`IndexNow scheduled dispatch failed (${response.status})`)
  return { state: 'dispatched' }
}
