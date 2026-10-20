import { createIndexNowDelivery } from './indexNowDelivery.ts'
import type { IndexNowIntent } from './indexNowDelivery.ts'
import { createIndexNowOutbox } from './indexNowOutbox.ts'
import type { IndexNowOutboxBucket } from './indexNowOutbox.ts'
import { indexNowFailureInfo } from './indexNow.ts'

const CONTROL_KEY = 'indexnow/control/v1/dispatch.json'
type Control = { schema: 1; leaseUntil: number; nextRunAt: number; intentCursor?: string; outboxCursor?: string }
export async function dispatchIndexNow(options: {
  enabled: boolean; bucket: IndexNowOutboxBucket; check: () => Promise<void>
  resolve: (intent: IndexNowIntent) => Promise<string[]>
  send: (paths: string[]) => Promise<{ submitted: number; status: number | null }>
  now?: () => number
}) {
  if (!options.enabled) return { state: 'disabled' }
  const now = options.now ?? Date.now, bucket = options.bucket
  // Fail closed on a damaged/unavailable control object. Its CAS lease also serializes different Worker instances.
  const object = await bucket.get(CONTROL_KEY)
  const control = object ? await object.json<Control>() : { schema: 1 as const, leaseUntil: 0, nextRunAt: 0 }
  if (!control || control.schema !== 1 || !Number.isSafeInteger(control.leaseUntil) || control.leaseUntil < 0
    || !Number.isSafeInteger(control.nextRunAt) || control.nextRunAt < 0
    || [control.intentCursor, control.outboxCursor].some(value => value !== undefined
      && (typeof value !== 'string' || value.length > 4096))) throw new Error('Invalid IndexNow dispatch control')
  if (control.leaseUntil > now() || control.nextRunAt > now()) return { state: 'waiting' }
  const active: Control = { ...control, leaseUntil: now() + 120_000, nextRunAt: now() + 600_000 }
  const lease = await bucket.put(CONTROL_KEY, JSON.stringify(active), {
    onlyIf: object ? { etagMatches: object.etag } : { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/json' },
  })
  if (!lease) return { state: 'busy' }
  let failure: { error: unknown } | undefined
  let result: { state: 'processed'; completed: number; received: number; deferred: number; blocked: number } | undefined
  try {
    await options.check()
    const intents = await createIndexNowDelivery(bucket, now).resolvePending(options.resolve,
      { cursor: active.intentCursor, check: options.check })
    active.intentCursor = intents.cursor
    const outbox = await createIndexNowOutbox(bucket, now).drain(options.send,
      { enabled: true, cursor: active.outboxCursor, limit: 10, check: options.check })
    active.outboxCursor = outbox.cursor
    result = { state: 'processed', completed: intents.completed, received: outbox.received,
      deferred: intents.deferred + outbox.deferred, blocked: intents.blocked + outbox.blocked }
  } catch (error) {
    const info = indexNowFailureInfo(error)
    if ('retryAt' in info && typeof info.retryAt === 'number') active.nextRunAt = Math.max(active.nextRunAt, info.retryAt)
    failure = { error }
  }
  // A failed write keeps the lease until expiry; never erase or reset persisted cursors on restart.
  const released = await bucket.put(CONTROL_KEY, JSON.stringify({ ...active, leaseUntil: 0 }), {
    onlyIf: { etagMatches: lease.etag }, httpMetadata: { contentType: 'application/json' },
  })
  if (!released) throw new Error('IndexNow dispatch lease lost')
  if (failure) throw failure.error
  if (!result) throw new Error('IndexNow dispatch result unavailable')
  return result
}
