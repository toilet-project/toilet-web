export const INDEXNOW_DISPATCH_PATH = '/_internal/indexnow/dispatch'
export const INDEXNOW_MANAGE_PATH = '/_internal/indexnow/manage'
const encoder = new TextEncoder()
const body = '{}'
function active(env) {
  return env.SITE_INDEXABLE === 'true' && env.INDEXNOW_ENABLED === 'true' && env.INDEXNOW_OUTBOX_ENABLED === 'true'
}
async function signature(secret, timestamp, path = INDEXNOW_DISPATCH_PATH, payload = body) {
  if (typeof secret !== 'string' || encoder.encode(secret).length < 32) throw new Error('Dispatch signing unavailable')
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const scope = path === INDEXNOW_DISPATCH_PATH ? 'indexnow-dispatch-v1' : 'indexnow-manage-v1'
  const value = encoder.encode(`${scope}\nPOST\n${path}\n${timestamp}\n${payload}`)
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, value)), b => b.toString(16).padStart(2, '0')).join('')
}
export async function createIndexNowDispatchRequest(secret, now = Date.now()) {
  const timestamp = String(Math.floor(now / 1000))
  return new Request(`https://geupddong.com${INDEXNOW_DISPATCH_PATH}`, { method: 'POST', body,
    headers: { 'Content-Type': 'application/json', 'x-indexnow-timestamp': timestamp,
      'x-indexnow-signature': await signature(secret, timestamp) } })
}
async function verify(request, secret, path, limit, now) {
  const url = new URL(request.url)
  if (request.method !== 'POST' || url.pathname !== path || url.search || url.hash
    || request.headers.get('content-type') !== 'application/json') return null
  const timestamp = request.headers.get('x-indexnow-timestamp') ?? ''
  const given = request.headers.get('x-indexnow-signature') ?? ''
  if (!/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300 || !/^[a-f0-9]{64}$/.test(given)
    || Number(request.headers.get('content-length')) > limit || !request.body) return null
  const reader = request.body.getReader()
  const chunks = []; let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.byteLength
      if (size > limit) { await reader.cancel(); return null }
      chunks.push(...result.value)
    }
  } finally { reader.releaseLock() }
  const payload = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(chunks))
  const expected = await signature(secret, timestamp, path, payload)
  let different = 0
  for (let i = 0; i < expected.length; i++) different |= expected.charCodeAt(i) ^ given.charCodeAt(i)
  return different ? null : payload
}
export async function verifyIndexNowDispatchRequest(request, secret, now = Date.now()) {
  return await verify(request, secret, INDEXNOW_DISPATCH_PATH, 2, now) === body
}
export async function createIndexNowManageRequest(secret, operation, now = Date.now()) {
  const payload = JSON.stringify(operation), timestamp = String(Math.floor(now / 1000))
  if (encoder.encode(payload).length > 8192) throw new Error('IndexNow operation is too large')
  return new Request(`https://geupddong.com${INDEXNOW_MANAGE_PATH}`, { method: 'POST', body: payload,
    headers: { 'Content-Type': 'application/json', 'x-indexnow-timestamp': timestamp,
      'x-indexnow-signature': await signature(secret, timestamp, INDEXNOW_MANAGE_PATH, payload) } })
}
export async function verifyIndexNowManageRequest(request, secret, now = Date.now()) {
  const payload = await verify(request, secret, INDEXNOW_MANAGE_PATH, 8192, now)
  if (payload === null) return null
  try { return JSON.parse(payload) } catch { return null }
}
/** Native scheduled events are the only automatic caller; no public unprotected drain endpoint. */
export async function runScheduledIndexNow(env, fetchInternal, now = Date.now()) {
  if (!active(env)) return { state: 'disabled' }
  const response = await fetchInternal(await createIndexNowDispatchRequest(env.CACHE_REVALIDATION_SECRET, now))
  if (!response.ok) throw new Error(`IndexNow scheduled dispatch failed (${response.status})`)
  return { state: 'dispatched' }
}
