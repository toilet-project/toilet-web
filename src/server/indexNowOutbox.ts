import { indexNowFailureInfo, indexNowUrls } from './indexNow.ts'
import type { R2BucketLike } from './sharedToiletCache.ts'

const PREFIX = 'indexnow/outbox/v1/'
const LEASE_MS = 120_000
const MAX_ATTEMPTS = 8
type Job = {
  schema: 1; paths: string[]; state: 'pending' | 'leased' | 'received' | 'blocked'
  attempts: number; dueAt: number; leaseUntil: number; status: number | null
}
export type IndexNowOutboxBucket = R2BucketLike & {
  list(options: { prefix: string; limit: number; cursor?: string }): Promise<{
    objects: { key: string }[]; truncated: boolean; cursor?: string
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
    const object = await bucket.get(key)
    if (!object) return null
    const job = await object.json<Job>()
    if (job.schema !== 1 || !Array.isArray(job.paths) || !job.paths.length || job.paths.length > 100
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
    })
  }
  return {
    async enqueue(eventId: string, input: Iterable<string>) {
      const paths = canonicalPaths(input)
      if (!paths.length) return { queued: false }
      if (paths.length > 100) throw new Error('IndexNow outbox job must be partitioned')
      const key = await jobKey(eventId)
      const stored = await save(key, { schema: 1, paths, state: 'pending', attempts: 0,
        dueAt: now(), leaseUntil: 0, status: null })
      if (!stored) {
        const existing = await load(key)
        if (!existing || JSON.stringify(existing.job.paths) !== JSON.stringify(paths))
          throw new Error('IndexNow outbox identity reused with different content')
      }
      return { queued: Boolean(stored) }
    },
    async drain(send: (paths: string[]) => Promise<Receipt>, options: {
      enabled: boolean; cursor?: string; limit?: number; check: () => Promise<void>
    }) {
      if (!options.enabled) return { received: 0, deferred: 0, blocked: 0, cursor: options.cursor }
      // Check shared cooldown before scanning storage or claiming any work.
      await options.check()
      const limit = options.limit ?? 10
      if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('Invalid outbox drain limit')
      const page = await bucket.list({ prefix: PREFIX, limit, cursor: options.cursor })
      const claimed: { key: string; job: Job; etag: string }[] = []
      let blocked = 0
      for (const { key } of page.objects.slice(0, limit)) {
        if (!/^indexnow\/outbox\/v1\/[a-f0-9]{64}\.json$/.test(key)) continue
        const current = await load(key)
        if (!current || ['received', 'blocked'].includes(current.job.state)
          || current.job.dueAt > now() || current.job.leaseUntil > now()) continue
        if (current.job.attempts >= MAX_ATTEMPTS) {
          if (await save(key, { ...current.job, state: 'blocked', leaseUntil: 0 }, current.etag)) blocked++
          continue
        }
        const job: Job = { ...current.job, state: 'leased', attempts: current.job.attempts + 1,
          leaseUntil: now() + LEASE_MS }
        const lease = await save(key, job, current.etag)
        if (lease) claimed.push({ key, job, etag: lease.etag })
      }
      const cursor = page.truncated ? page.cursor : undefined
      if (!claimed.length) return { received: 0, deferred: 0, blocked, cursor }
      // At most ten jobs of 100 paths each; duplicate URLs share one remote notification.
      const paths = [...new Set(claimed.flatMap(item => item.job.paths))]
      let receipt: Receipt
      try {
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
          const attempts = failure.reason === 'rate_limit' ? item.job.attempts - 1 : item.job.attempts
          const exhausted = attempts >= MAX_ATTEMPTS
          const retryAt = 'retryAt' in failure && typeof failure.retryAt === 'number' ? failure.retryAt : 0
          const job: Job = { ...item.job, attempts, state: permanent || exhausted ? 'blocked' : 'pending',
            dueAt: Math.max(retryAt, now() + Math.min(86_400_000, 600_000 * 2 ** Math.max(0, attempts - 1))),
            leaseUntil: 0, status: failure.status }
          if (await save(item.key, job, item.etag)) {
            if (job.state === 'blocked') blocked++; else deferred++
          }
        }
        return { received: 0, deferred, blocked, cursor }
      }
      let received = 0
      // Do not catch receipt-persistence failures as remote failures: leave the lease recoverable.
      for (const item of claimed) {
        if (await save(item.key, { ...item.job, state: 'received', leaseUntil: 0,
          status: receipt.status }, item.etag)) received++
      }
      // 202 means receipt/key-validation pending, never successful crawl or indexation.
      return { received, deferred: 0, blocked, cursor }
    },
  }
}
