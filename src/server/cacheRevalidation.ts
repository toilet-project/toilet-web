import { createHmac, timingSafeEqual } from 'node:crypto'
import type { ToiletCacheEvent } from './sharedToiletCache'

export const REVALIDATION_PATH = '/_internal/cache/revalidate'
const MAX_BODY_BYTES = 32_768
const MAX_CLOCK_SKEW_SECONDS = 300
export type AuthenticatedRevalidation = { protocol: 'v1' | 'v2'; events: ToiletCacheEvent[] }

export class RevalidationError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

export function signatureFor(secret: string, timestamp: string, body: string) {
  return createHmac('sha256', secret).update(`v1\nPOST\n${REVALIDATION_PATH}\n${timestamp}\n${body}`, 'utf8').digest('hex')
}

export async function authenticateRevalidation(request: Request, secret: string | undefined, now = Date.now()): Promise<AuthenticatedRevalidation> {
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) throw new RevalidationError(503, 'Not configured')
  const timestamp = request.headers.get('x-cache-timestamp') ?? ''
  const signature = request.headers.get('x-cache-signature') ?? ''
  if (!/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS
    || !/^[a-f0-9]{64}$/.test(signature)) throw new RevalidationError(401, 'Unauthorized')
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new RevalidationError(415, 'JSON required')
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new RevalidationError(413, 'Request too large')
  const reader = request.body?.getReader()
  if (!reader) throw new RevalidationError(400, 'Empty request')
  let length = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new RevalidationError(413, 'Request too large') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const body = Buffer.concat(chunks).toString('utf8')
  const expected = signatureFor(secret, timestamp, body)
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) throw new RevalidationError(401, 'Unauthorized')
  let payload: unknown
  try { payload = JSON.parse(body) } catch { throw new RevalidationError(400, 'Invalid JSON') }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new RevalidationError(400, 'Invalid payload')
  const root = payload as Record<string, unknown>
  if (Object.keys(root).length === 1 && Array.isArray(root.toiletIds)) {
    const ids = root.toiletIds
    if (ids.length < 1 || ids.length > 100
      || ids.some(id => typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1)) throw new RevalidationError(400, 'Invalid toilet IDs')
    return { protocol: 'v1', events: [...new Set(ids)].map(toiletId => ({ toiletId, revision: 0,
      action: 'UPSERT' as const, catalogChanged: false })) }
  }
  if (Object.keys(root).length !== 2 || root.contractVersion !== 2 || !Array.isArray(root.events)
    || root.events.length < 1 || root.events.length > 100) throw new RevalidationError(400, 'Invalid payload')
  const events = new Map<number, ToiletCacheEvent>()
  for (const value of root.events) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RevalidationError(400, 'Invalid event')
    const event = value as Record<string, unknown>
    if (Object.keys(event).some(key => !['toiletId', 'revision', 'action', 'catalogChanged'].includes(key))
      || typeof event.toiletId !== 'number' || !Number.isSafeInteger(event.toiletId) || event.toiletId < 1
      || typeof event.revision !== 'number' || !Number.isSafeInteger(event.revision) || event.revision < 1
      || !['UPSERT', 'DELETE', 'PRIVATE'].includes(String(event.action))
      || typeof event.catalogChanged !== 'boolean') throw new RevalidationError(400, 'Invalid event')
    const parsed: ToiletCacheEvent = { toiletId: event.toiletId as number, revision: event.revision as number,
      action: event.action as ToiletCacheEvent['action'], catalogChanged: event.catalogChanged as boolean }
    const previous = events.get(parsed.toiletId)
    if (!previous || parsed.revision > previous.revision
      || (parsed.revision === previous.revision && parsed.action !== 'UPSERT')) events.set(parsed.toiletId, parsed)
  }
  return { protocol: 'v2', events: [...events.values()] }
}
