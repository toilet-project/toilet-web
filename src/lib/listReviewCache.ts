import type { ReviewSummary } from './reviewApi'

/** Public summaries only; limit concurrent reads and reuse results across list views. */
export function createListReviewCache(load: (id: number) => Promise<ReviewSummary>, now = Date.now) {
  const cache = new Map<number, { value: ReviewSummary; expires: number }>()
  const pending = new Map<number, Promise<ReviewSummary>>()
  const queue: (() => void)[] = []
  let running = 0
  function pump() {
    while (running < 3 && queue.length) queue.shift()!()
  }
  return {
    get(id: number): Promise<ReviewSummary> {
      const entry = cache.get(id)
      if (entry && entry.expires > now()) return Promise.resolve(entry.value)
      if (pending.has(id)) return pending.get(id)!
      const result = new Promise<ReviewSummary>((resolve, reject) => {
        queue.push(() => {
          running++
          void Promise.resolve().then(() => load(id)).then(value => {
            cache.delete(id)
            cache.set(id, { value, expires: now() + 60_000 })
            while (cache.size > 128) cache.delete(cache.keys().next().value!)
            resolve(value)
          }, reject).finally(() => { running--; pending.delete(id); pump() })
        })
      })
      pending.set(id, result)
      pump()
      return result
    },
  }
}
