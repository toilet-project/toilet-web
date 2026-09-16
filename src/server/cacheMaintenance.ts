import { createHmac, timingSafeEqual } from 'node:crypto'

export const CACHE_REFRESH_PATH = '/_internal/cache/refresh-toilet'
const MAX_BODY_BYTES = 1_024
const MAX_CLOCK_SKEW_SECONDS = 300

export class CacheMaintenanceError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export function maintenanceSignatureFor(secret: string, timestamp: string, body: string) {
  return createHmac('sha256', secret)
    .update(`v1\nPOST\n${CACHE_REFRESH_PATH}\n${timestamp}\n${body}`, 'utf8').digest('hex')
}

export async function authenticateCacheRefresh(request: Request, secret: string | undefined, now = Date.now()) {
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) throw new CacheMaintenanceError(503, 'Not configured')
  const timestamp = request.headers.get('x-cache-timestamp') ?? ''
  const signature = request.headers.get('x-cache-signature') ?? ''
  if (!/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS
    || !/^[a-f0-9]{64}$/.test(signature)) throw new CacheMaintenanceError(401, 'Unauthorized')
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    throw new CacheMaintenanceError(415, 'JSON required')
  }
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new CacheMaintenanceError(413, 'Request too large')
  const reader = request.body?.getReader()
  if (!reader) throw new CacheMaintenanceError(400, 'Empty request')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new CacheMaintenanceError(413, 'Request too large') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const body = Buffer.concat(chunks).toString('utf8')
  const expected = maintenanceSignatureFor(secret, timestamp, body)
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new CacheMaintenanceError(401, 'Unauthorized')
  }
  let payload: unknown
  try { payload = JSON.parse(body) } catch { throw new CacheMaintenanceError(400, 'Invalid JSON') }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new CacheMaintenanceError(400, 'Invalid payload')
  const value = payload as Record<string, unknown>
  if (Object.keys(value).length !== 2 || value.contractVersion !== 1
    || typeof value.toiletId !== 'number' || !Number.isSafeInteger(value.toiletId) || value.toiletId < 1) {
    throw new CacheMaintenanceError(400, 'Invalid payload')
  }
  return { toiletId: value.toiletId }
}
