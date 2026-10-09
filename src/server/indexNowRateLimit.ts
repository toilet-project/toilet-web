import type { R2BucketLike } from './sharedToiletCache.ts'

const COOLDOWN_KEY = 'indexnow/v1/cooldown.json'
const MIN_COOLDOWN_MS = 10 * 60 * 1000

export class IndexNowRateLimitError extends Error {
  readonly retryAt: number
  constructor(retryAt: number) {
    super('IndexNow submission deferred by shared rate limit')
    this.name = 'IndexNowRateLimitError'
    this.retryAt = retryAt
  }
}

export function indexNowRetryAt(header: string | null, now: number) {
  const requested = header && /^\d+$/.test(header.trim())
    ? now + Number(header) * 1000 : header ? Date.parse(header) : NaN
  return Math.max(now + MIN_COOLDOWN_MS,
    Number.isSafeInteger(requested) && requested <= 8_640_000_000_000_000 ? requested : 0)
}

export type IndexNowRateLimit = {
  check(): Promise<void>
  defer(retryAt: number): Promise<void>
}

/** One small shared object; it contains no URLs and is not a pending-work queue. */
export function createIndexNowRateLimit(bucket: R2BucketLike, now: () => number = Date.now): IndexNowRateLimit {
  async function load() {
    const object = await bucket.get(COOLDOWN_KEY)
    if (!object) return null
    const value = await object.json<{ schema?: unknown; retryAt?: unknown }>()
    if (!value || value.schema !== 1 || !Number.isSafeInteger(value.retryAt)
      || typeof value.retryAt !== 'number' || value.retryAt < 0 || value.retryAt > 8_640_000_000_000_000)
      throw new Error('Invalid IndexNow cooldown state')
    return { etag: object.etag, retryAt: value.retryAt }
  }
  return {
    async check() {
      const current = await load()
      if (current && current.retryAt > now()) throw new IndexNowRateLimitError(current.retryAt)
    },
    async defer(retryAt) {
      // Conditional writes prevent concurrent detail/district notifications from shortening a pause.
      for (let attempt = 0; attempt < 5; attempt++) {
        const current = await load()
        if (current && current.retryAt >= retryAt) return
        const saved = await bucket.put(COOLDOWN_KEY, JSON.stringify({ schema: 1, retryAt }), {
          onlyIf: current ? { etagMatches: current.etag } : { etagDoesNotMatch: '*' },
          httpMetadata: { contentType: 'application/json' },
        })
        if (saved) return
      }
      throw new Error('IndexNow cooldown contention')
    },
  }
}
