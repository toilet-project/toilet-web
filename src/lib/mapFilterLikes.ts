import type { LikedToiletPage } from './toiletEngagement.ts'

function readWithDeadline(readPage: () => Promise<LikedToiletPage>, signal: AbortSignal) {
  return new Promise<LikedToiletPage>((resolve, reject) => {
    const abort = () => finish(() => reject(signal.reason))
    const timeout = setTimeout(() => finish(() => reject(new Error('Liked facilities request timed out.'))), 15_000)
    const finish = (settle: () => void) => { clearTimeout(timeout); signal.removeEventListener('abort', abort); settle() }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) { abort(); return }
    void readPage().then(value => finish(() => resolve(value)), error => finish(() => reject(error)))
  })
}

/** Read private IDs in memory only. A cancelled/changed account must never publish a partial list. */
export async function loadMapFilterLikedIds(readPage: (page: number) => Promise<LikedToiletPage>, signal: AbortSignal): Promise<number[]> {
  const ids = new Set<number>()
  let expectedTotal: number | undefined
  for (let page = 0; ; page++) {
    signal.throwIfAborted()
    const result = await readWithDeadline(() => readPage(page), signal)
    signal.throwIfAborted()
    if (expectedTotal === undefined) {
      expectedTotal = result.total
      if (expectedTotal > 10_000) throw new Error('Too many liked facilities to filter safely. The list was not truncated.')
    }
    if (result.page !== page || result.total !== expectedTotal || result.size < 1 || result.items.length > result.size)
      throw new Error('Liked facilities changed while loading. Retry the complete list.')
    for (const item of result.items) {
      if (ids.has(item.id)) throw new Error('Duplicate liked facilities. Retry the complete list.')
      ids.add(item.id)
    }
    if (ids.size === expectedTotal) return [...ids]
    if (result.items.length < result.size || ids.size > expectedTotal)
      throw new Error('Incomplete liked facilities. Retry the complete list.')
  }
}
