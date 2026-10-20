import { indexNowFailureInfo, indexNowUrls } from './indexNow.ts'
import type { R2BucketLike } from './sharedToiletCache.ts'
import { canCompactIndexNow, indexNowDigest, indexNowMetadata, recoveredIndexNow, skipSettledIndexNow, validLifecycle, IndexNowBudgetError } from './indexNowLifecycle.ts'
import type { IndexNowLifecycle } from './indexNowLifecycle.ts'

const PREFIX = 'indexnow/outbox/v1/'
const LEASE_MS = 120_000
const MAX_ATTEMPTS = 8
type Job = IndexNowLifecycle & {
  schema: 1; paths: string[]; state: 'pending' | 'leased' | 'received' | 'blocked'
  attempts: number; dueAt: number; leaseUntil: number; status: number | null
  pathsDigest?: string; pathCount?: number
}
export type IndexNowOutboxBucket = R2BucketLike & {
  list(options: { prefix: string; limit: number; cursor?: string; include?: string[] }): Promise<{
    objects: { key: string; customMetadata?: Record<string, string> }[]; truncated: boolean; cursor?: string
  }>
}
type Receipt = { submitted: number; status: number | null }

function canonicalPaths(paths: Iterable<string>) {
  return indexNowUrls(paths).map(url => decodeURI(new URL(url).pathname)).sort()
}
async function jobKey(eventId: string) {
  if (!eventId || eventId.length > 256) throw new Error('Invalid IndexNow event identity')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(eventId))
  return PREFIX + Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('') + '.json'
}

/** Runtime connection is gated by INDEXNOW_OUTBOX_ENABLED and a separately approved scheduler.
 * Stores public paths only, separately from visitor cache objects. Delivery is at-least-once:
 * a crash after remote acceptance but before receipt persistence can repeat the notification.
 */
export function createIndexNowOutbox(bucket: IndexNowOutboxBucket, now: () => number = Date.now) {
  async function load(key: string) {
    if (!/^indexnow\/outbox\/v1\/[a-f0-9]{64}\.json$/.test(key)) throw new Error('Invalid IndexNow outbox key')
    const object = await bucket.get(key)
    if (!object) return null
    const job = await object.json<Job>()
    const compact = job?.state === 'received' && job.compactedAt !== undefined
    if (!job || job.schema !== 1 || !validLifecycle(job) || !Array.isArray(job.paths) || job.paths.length > 100
      || job.compactedAt !== undefined && !compact
      || (compact ? job.paths.length !== 0 || !/^[a-f0-9]{64}$/.test(job.pathsDigest ?? '')
        || !Number.isSafeInteger(job.pathCount) || job.pathCount! < 1 || job.pathCount! > 100
        || job.settledAt === undefined : !job.paths.length || job.pathsDigest !== undefined || job.pathCount !== undefined)
      || job.paths.some(path => typeof path !== 'string')
      || JSON.stringify(canonicalPaths(job.paths)) !== JSON.stringify(job.paths)
      || !['pending', 'leased', 'received', 'blocked'].includes(job.state)
      || !Number.isSafeInteger(job.attempts) || job.attempts < 0 || job.attempts > MAX_ATTEMPTS
      || !Number.isSafeInteger(job.dueAt) || job.dueAt < 0
      || !Number.isSafeInteger(job.leaseUntil) || job.leaseUntil < 0
      || !(job.status === null || Number.isInteger(job.status) && job.status >= 100 && job.status <= 599))
      throw new Error('Invalid IndexNow outbox record')
    return { job, etag: object.etag }
  }
  function save(key: string, job: Job, etag?: string) {
    return bucket.put(key, JSON.stringify(job), {
      onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: '*' },
      httpMetadata: { contentType: 'application/json' },
      customMetadata: indexNowMetadata(job),
    })
  }
  async function compact(key: string, current: { job: Job; etag: string }) {
    if (current.job.state !== 'received' || !canCompactIndexNow(current.job, now())) return false
    const job = { ...current.job, paths: [], pathsDigest: await indexNowDigest(JSON.stringify(current.job.paths)),
      pathCount: current.job.paths.length, compactedAt: now(), updatedAt: now() }
    return Boolean(await save(key, job, current.etag))
  }
  return {
    inspect: load,
    async compact(key: string, etag: string, apply = false) {
      const current = await load(key)
      if (!current || current.etag !== etag) return { state: 'conflict' }
      if (current.job.state !== 'received' || !canCompactIndexNow(current.job, now())) return { state: 'ineligible' }
      return { state: apply ? await compact(key, current) ? 'compacted' : 'conflict' : 'eligible' }
    },
    async recover(key: string, etag: string) {
      const current = await load(key)
      if (!current || current.etag !== etag) return { state: 'conflict' }
      if (current.job.state !== 'blocked' || (current.job.recoveries ?? 0) >= 3) return { state: 'ineligible' }
      return { state: await save(key, recoveredIndexNow(current.job, now()), current.etag) ? 'recovered' : 'conflict' }
    },
    async enqueue(eventId: string, input: Iterable<string>) {
      const paths = canonicalPaths(input)
      if (!paths.length) return { queued: false }
      if (paths.length > 100) throw new Error('IndexNow outbox job must be partitioned')
      const key = await jobKey(eventId)
      const stored = await save(key, { schema: 1, paths, state: 'pending', attempts: 0,
        dueAt: now(), leaseUntil: 0, status: null, createdAt: now(), updatedAt: now() })
      if (!stored) {
        const existing = await load(key)
        if (!existing || (existing.job.compactedAt === undefined
          ? JSON.stringify(existing.job.paths) !== JSON.stringify(paths)
          : existing.job.pathCount !== paths.length || existing.job.pathsDigest !== await indexNowDigest(JSON.stringify(paths))))
          throw new Error('IndexNow outbox identity reused with different content')
      }
      return { queued: Boolean(stored) }
    },
    async drain(send: (paths: string[]) => Promise<Receipt>, options: {
      enabled: boolean; cursor?: string; limit?: number; check: () => Promise<void>; proceed?: () => boolean; compactLimit?: number
    }) {
      if (!options.enabled) return { received: 0, deferred: 0, blocked: 0, cursor: options.cursor }
      // Check shared cooldown before scanning storage or claiming any work.
      await options.check()
      const limit = options.limit ?? 10, compactLimit = options.compactLimit ?? 2
      if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('Invalid outbox drain limit')
      if (!Number.isInteger(compactLimit) || compactLimit < 0 || compactLimit > 10) throw new Error('Invalid compaction limit')
      const page = await bucket.list({ prefix: PREFIX, limit, cursor: options.cursor, include: ['customMetadata'] })
      const claimed: { key: string; job: Job; etag: string }[] = []
      let blocked = 0
      let scanned = 0, compacted = 0, observedBlocked = 0
      for (const { key, customMetadata } of page.objects.slice(0, limit)) {
        if (options.proceed && !options.proceed()) break
        scanned++
        if (!/^indexnow\/outbox\/v1\/[a-f0-9]{64}\.json$/.test(key)) continue
        if (skipSettledIndexNow(customMetadata, 'received', now())) continue
        if (compacted >= compactLimit && customMetadata?.indexnow === '1' && customMetadata.state === 'received') continue
        const current = await load(key)
        if (current?.job.state === 'received' && canCompactIndexNow(current.job, now()) && compacted < compactLimit) {
          if (await compact(key, current)) compacted++
          continue
        }
        if (current?.job.state === 'blocked') observedBlocked++
        if (!current || ['received', 'blocked'].includes(current.job.state)
          || current.job.dueAt > now() || current.job.leaseUntil > now()) continue
        if (current.job.attempts >= MAX_ATTEMPTS) {
          if (await save(key, { ...current.job, state: 'blocked', leaseUntil: 0, settledAt: now(), updatedAt: now() }, current.etag)) blocked++
          continue
        }
        const job: Job = { ...current.job, state: 'leased', attempts: current.job.attempts + 1,
          leaseUntil: now() + LEASE_MS, updatedAt: now() }
        const lease = await save(key, job, current.etag)
        if (lease) claimed.push({ key, job, etag: lease.etag })
      }
      const cursor = page.truncated ? page.cursor : undefined
      if (!claimed.length) return { received: 0, deferred: 0, blocked, cursor, scanned, compacted, attempted: 0, observedBlocked }
      // At most ten jobs of 100 paths each; duplicate URLs share one remote notification.
      const paths = [...new Set(claimed.flatMap(item => item.job.paths))]
      let receipt: Receipt
      try {
        if (options.proceed && !options.proceed()) throw new IndexNowBudgetError()
        await options.check()
        receipt = await send(paths)
        if (![200, 202].includes(receipt.status ?? 0) || receipt.submitted !== paths.length)
          throw new Error('Invalid IndexNow receipt')
      } catch (error) {
        const failure = indexNowFailureInfo(error)
        const permanent = failure.reason === 'http' && failure.status !== null
          && failure.status >= 400 && failure.status < 500 && failure.status !== 429
        let deferred = 0
        for (const item of claimed) {
          // A shared cooldown check made no remote attempt; do not exhaust work merely by polling.
          const attempts = ['rate_limit', 'budget'].includes(failure.reason) ? item.job.attempts - 1 : item.job.attempts
          const exhausted = attempts >= MAX_ATTEMPTS
          const retryAt = 'retryAt' in failure && typeof failure.retryAt === 'number' ? failure.retryAt : 0
          const job: Job = { ...item.job, attempts, state: permanent || exhausted ? 'blocked' : 'pending',
            dueAt: Math.max(retryAt, now() + Math.min(86_400_000, 600_000 * 2 ** Math.max(0, attempts - 1))),
            leaseUntil: 0, status: failure.status, updatedAt: now(),
            ...((permanent || exhausted) ? { settledAt: now() } : {}) }
          if (await save(item.key, job, item.etag)) {
            if (job.state === 'blocked') blocked++; else deferred++
          }
        }
        return { received: 0, deferred, blocked, cursor, scanned, compacted, attempted: claimed.length, observedBlocked }
      }
      let received = 0
      // Do not catch receipt-persistence failures as remote failures: leave the lease recoverable.
      for (const item of claimed) {
        if (await save(item.key, { ...item.job, state: 'received', leaseUntil: 0,
          status: receipt.status, settledAt: now(), updatedAt: now() }, item.etag)) received++
      }
      // 202 means receipt/key-validation pending, never successful crawl or indexation.
      return { received, deferred: 0, blocked, cursor, scanned, compacted, attempted: claimed.length, observedBlocked }
    },
  }
}
