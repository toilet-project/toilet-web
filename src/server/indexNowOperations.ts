import type { IndexNowOutboxBucket } from './indexNowOutbox.ts'
import { createIndexNowOutbox } from './indexNowOutbox.ts'
import { createIndexNowDelivery } from './indexNowDelivery.ts'
import { canCompactIndexNow } from './indexNowLifecycle.ts'

type Kind = 'intents' | 'outbox'
type Operation = { action: 'status' }
  | { action: 'inspect'; kind: Kind; limit?: number; cursor?: string }
  | { action: 'recover' | 'compact'; key: string; etag: string; confirm?: boolean }
export class IndexNowOperationError extends Error {
  constructor() { super('Invalid IndexNow operation'); this.name = 'IndexNowOperationError' }
}
function validate(value: unknown): asserts value is Operation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new IndexNowOperationError()
  const op = value as Operation, keys = Object.keys(op)
  if (op.action === 'status' && keys.length === 1) return
  if (op.action === 'inspect' && ['intents', 'outbox'].includes(op.kind)
    && (op.limit === undefined || Number.isInteger(op.limit) && op.limit >= 1 && op.limit <= 20)
    && (op.cursor === undefined || typeof op.cursor === 'string' && op.cursor.length <= 4096)
    && keys.every(key => ['action', 'kind', 'limit', 'cursor'].includes(key))) return
  if (['recover', 'compact'].includes(op.action) && 'key' in op
    && /^indexnow\/(intents|outbox)\/v1\/[a-f0-9]{64}\.json$/.test(op.key)
    && typeof op.etag === 'string' && op.etag.length > 0 && op.etag.length <= 256
    && (op.confirm === undefined || typeof op.confirm === 'boolean')
    && keys.every(key => ['action', 'key', 'etag', 'confirm'].includes(key))) return
  throw new IndexNowOperationError()
}
/** Bounded operator API: no send, origin fetch, cache invalidation or deletion exists here. */
export async function operateIndexNow(bucket: IndexNowOutboxBucket, input: unknown,
  options: { check: () => Promise<void>; now?: () => number }) {
  validate(input)
  const now = options.now ?? Date.now
  const intents = createIndexNowDelivery(bucket, now), outbox = createIndexNowOutbox(bucket, now)
  if (input.action === 'status') {
    const object = await bucket.get('indexnow/control/v1/dispatch.json')
    if (!object) return { state: 'not_started' }
    const value = await object.json<{ schema: number; leaseUntil: number; nextRunAt: number; lastRun?: Record<string, unknown> }>()
    if (!value || value.schema !== 1 || !Number.isSafeInteger(value.leaseUntil) || value.leaseUntil < 0
      || !Number.isSafeInteger(value.nextRunAt) || value.nextRunAt < 0) throw new Error('Invalid IndexNow control')
    const numeric = ['at', 'elapsedMs', 'completed', 'received', 'deferred', 'blocked', 'compacted',
      'intentScanned', 'outboxScanned', 'observedBlocked', 'staleStaged']
    const lastRun = value.lastRun ? Object.fromEntries(numeric.map(key => [key,
      Number.isSafeInteger(value.lastRun![key]) && Number(value.lastRun![key]) >= 0 ? value.lastRun![key] : null])) : null
    return { state: value.leaseUntil > now() ? 'running' : 'idle', nextRunAt: value.nextRunAt, sampled: true,
      lastRun: lastRun ? { ...lastRun, yielded: value.lastRun?.yielded === true,
        state: value.lastRun?.state === 'processed' ? 'processed' : 'failed' } : null }
  }
  async function inspect(key: string) {
    if (key.startsWith('indexnow/intents/')) {
      const stored = await intents.inspect(key)
      return stored ? { value: stored.value, etag: stored.etag } : null
    }
    const stored = await outbox.inspect(key)
    return stored ? { value: stored.job, etag: stored.etag } : null
  }
  function summary(key: string, stored: NonNullable<Awaited<ReturnType<typeof inspect>>>) {
    const value = stored.value
    return { key, etag: stored.etag, state: value.state, attempts: value.attempts,
      recoveries: value.recoveries ?? 0, dueAt: value.dueAt, updatedAt: value.updatedAt ?? null,
      settledAt: value.settledAt ?? null, compacted: value.compactedAt !== undefined,
      status: 'status' in value ? value.status : null,
      canRecover: value.state === 'blocked' && (value.recoveries ?? 0) < 3,
      canCompact: ['done', 'received'].includes(value.state) && canCompactIndexNow(value, now()),
      needsSenderReplay: value.state === 'staged' && value.updatedAt !== undefined && value.updatedAt + 3_600_000 <= now() }
  }
  if (input.action === 'inspect') {
    const page = await bucket.list({ prefix: `indexnow/${input.kind}/v1/`, limit: input.limit ?? 20, cursor: input.cursor })
    const records = []
    for (const { key } of page.objects.slice(0, input.limit ?? 20)) {
      if (!/^indexnow\/(intents|outbox)\/v1\/[a-f0-9]{64}\.json$/.test(key)) continue
      try {
        const stored = await inspect(key)
        if (stored) records.push(summary(key, stored))
      } catch { records.push({ key, state: 'unreadable', canRecover: false, canCompact: false }) }
    }
    return { state: 'inspected', scope: 'page', records, cursor: page.truncated ? page.cursor : null }
  }
  const stored = await inspect(input.key)
  if (!stored || stored.etag !== input.etag) return { state: 'conflict' }
  const target = input.key.startsWith('indexnow/intents/') ? intents : outbox
  if (input.action === 'compact') return target.compact(input.key, input.etag, input.confirm === true)
  if (!summary(input.key, stored).canRecover) return { state: 'ineligible' }
  if (!input.confirm) return { state: 'eligible', dryRun: true }
  await options.check() // Manual recovery must not bypass the common cooldown.
  return target.recover(input.key, input.etag)
}
