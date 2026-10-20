import { createIndexNowDelivery } from './indexNowDelivery.ts'
import type { IndexNowIntent } from './indexNowDelivery.ts'
import { createIndexNowOutbox } from './indexNowOutbox.ts'
import type { IndexNowOutboxBucket } from './indexNowOutbox.ts'
import { indexNowFailureInfo } from './indexNow.ts'

const CONTROL_KEY = 'indexnow/control/v1/dispatch.json'
type RunSummary = { at: number; elapsedMs: number; yielded: boolean; state: string;
  completed: number; received: number; deferred: number; blocked: number; compacted: number;
  intentScanned: number; outboxScanned: number; observedBlocked: number; staleStaged: number }
type Control = { schema: 1; leaseUntil: number; nextRunAt: number; intentCursor?: string; outboxCursor?: string; lastRun?: RunSummary }
export async function dispatchIndexNow(options: {
  enabled: boolean; bucket: IndexNowOutboxBucket; check: () => Promise<void>
  resolve: (intent: IndexNowIntent) => Promise<string[]>
  send: (paths: string[]) => Promise<{ submitted: number; status: number | null }>
  now?: () => number
}) {
  if (!options.enabled) return { state: 'disabled' }
  const now = options.now ?? Date.now, bucket = options.bucket
  const startedAt = now()
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
  const proceed = () => now() - startedAt < 20_000
  const summary = { completed: 0, received: 0, deferred: 0, blocked: 0, compacted: 0,
    intentScanned: 0, outboxScanned: 0, observedBlocked: 0, staleStaged: 0 }
  let result: ({ state: 'processed'; yielded: boolean; sampled: true } & typeof summary) | undefined
  try {
    await options.check()
    let attempted = 0, intentCompacted = 0, outboxCompacted = 0
    const delivery = createIndexNowDelivery(bucket, now)
    while (proceed() && attempted < 10 && summary.intentScanned < 1000) {
      const intents = await delivery.resolvePending(options.resolve, { cursor: active.intentCursor,
        check: options.check, proceed, limit: Math.min(10 - attempted, 1000 - summary.intentScanned),
        compactLimit: 2 - intentCompacted })
      active.intentCursor = intents.cursor; attempted += intents.attempted; intentCompacted += intents.compacted
      summary.intentScanned += intents.scanned; summary.completed += intents.completed
      summary.deferred += intents.deferred; summary.blocked += intents.blocked
      summary.compacted += intents.compacted; summary.observedBlocked += intents.observedBlocked
      summary.staleStaged += intents.staleStaged
      if (!intents.cursor || !intents.scanned) break
    }
    const queue = createIndexNowOutbox(bucket, now)
    while (proceed() && summary.outboxScanned < 1000) {
      const outbox = await queue.drain(options.send, { enabled: true, cursor: active.outboxCursor,
        limit: Math.min(10, 1000 - summary.outboxScanned), check: options.check, proceed,
        compactLimit: 2 - outboxCompacted })
      active.outboxCursor = outbox.cursor; outboxCompacted += outbox.compacted ?? 0
      summary.outboxScanned += outbox.scanned ?? 0; summary.received += outbox.received
      summary.deferred += outbox.deferred; summary.blocked += outbox.blocked
      summary.compacted += outbox.compacted ?? 0; summary.observedBlocked += outbox.observedBlocked ?? 0
      // Never make a second remote submission in this invocation, even after rejection.
      if (outbox.attempted || !outbox.cursor || !outbox.scanned) break
    }
    result = { state: 'processed', yielded: !proceed(), sampled: true, ...summary }
  } catch (error) {
    const info = indexNowFailureInfo(error)
    if ('retryAt' in info && typeof info.retryAt === 'number') active.nextRunAt = Math.max(active.nextRunAt, info.retryAt)
    failure = { error }
  }
  active.lastRun = { at: startedAt, elapsedMs: Math.max(0, now() - startedAt), yielded: !proceed(),
    state: failure ? 'failed' : 'processed', ...summary }
  // A failed write keeps the lease until expiry; never erase or reset persisted cursors on restart.
  const released = await bucket.put(CONTROL_KEY, JSON.stringify({ ...active, leaseUntil: 0 }), {
    onlyIf: { etagMatches: lease.etag }, httpMetadata: { contentType: 'application/json' },
  })
  if (!released) throw new Error('IndexNow dispatch lease lost')
  if (failure) throw failure.error
  if (!result) throw new Error('IndexNow dispatch result unavailable')
  return result
}
