import { createHash } from 'node:crypto'

export function selectInvalidatedPublicIds(objects, publicIds) {
  if (!Array.isArray(objects) || !Array.isArray(publicIds)
    || publicIds.some(id => !Number.isSafeInteger(id) || id < 1)) throw new Error('Invalid inventory')
  const published = new Set(publicIds)
  const ids = new Set()
  for (const object of objects) {
    const match = object.key?.match(/^public-toilets\/v1\/toilets\/([1-9]\d*)\.json$/)
    if (!match || !Number.isSafeInteger(Number(match[1]))) throw new Error('Unexpected inventory key')
    const id = Number(match[1])
    if (published.has(id) && object.metadata?.state === 'invalidated') ids.add(id)
  }
  return [...ids].sort((a, b) => a - b)
}

export function fillFingerprint(baseUrl, ids) {
  return createHash('sha256').update(JSON.stringify({ baseUrl, ids })).digest('hex')
}

// Ordinary public GET: fresh records are reused, tombstones remain authoritative.
// No forced refresh endpoint, credentials, HTML generation, or direct origin calls.
export async function fillSharedData({ ids, baseUrl, checkpoint, save, fetchImpl = fetch,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now,
  rps = 4, concurrency = 3, maxItems = ids.length, onProgress = () => {} }) {
  if (!['https://geupddong.com', 'https://preview.geupddong.com'].includes(baseUrl)) throw new Error('Unsupported host')
  if (!Number.isInteger(rps) || rps < 1 || rps > 5
    || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4
    || !Number.isSafeInteger(maxItems) || maxItems < 0) throw new Error('Invalid request limits')
  if (!Array.isArray(ids) || ids.some(id => !Number.isSafeInteger(id) || id < 1)
    || new Set(ids).size !== ids.length) throw new Error('Invalid IDs')
  const fingerprint = fillFingerprint(baseUrl, ids)
  if (checkpoint.schema !== 1 || checkpoint.fingerprint !== fingerprint
    || !Array.isArray(checkpoint.completed) || !Array.isArray(checkpoint.notFound)
    || [...checkpoint.completed, ...checkpoint.notFound].some(id => !ids.includes(id))) throw new Error('Checkpoint mismatch')
  const completed = new Set(checkpoint.completed), notFound = new Set(checkpoint.notFound)
  const pending = ids.filter(id => !completed.has(id) && !notFound.has(id)).slice(0, maxItems)
  let cursor = 0, nextAt = now(), stopped = false, saved = Promise.resolve(), processed = 0
  const report = { target: ids.length, pending: pending.length, succeeded: 0, notFound: 0, failures: [],
    requests: 0, startedAt: new Date(now()).toISOString(), elapsedMs: 0 }
  const persist = () => {
    saved = saved.then(() => save({ schema: 1, fingerprint, completed: [...completed], notFound: [...notFound] }))
    return saved
  }
  const worker = async () => {
    while (!stopped && cursor < pending.length) {
      const id = pending[cursor++]
      const slot = Math.max(now(), nextAt)
      nextAt = slot + Math.ceil(1000 / rps)
      if (slot > now()) await wait(slot - now())
      if (stopped) return
      try {
        report.requests++
        const response = await fetchImpl(`${baseUrl}/api/public/toilets/${id}`, {
          method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store',
          headers: { 'user-agent': 'geupddong-shared-data-fill/1' }, signal: AbortSignal.timeout(15_000),
        })
        if (response.status === 404) {
          await response.arrayBuffer()
          notFound.add(id); report.notFound++
        } else {
          if (!response.ok) { await response.arrayBuffer(); throw new Error(`HTTP ${response.status}`) }
          const body = await response.json()
          if (body.id !== id || typeof body.name !== 'string') throw new Error('Unexpected public detail')
          completed.add(id); report.succeeded++
        }
      } catch (error) {
        stopped = true // Stop new requests on rate limits, origin errors, or network trouble.
        report.failures.push({ id, message: error.message })
      }
      processed++
      if (stopped || processed % 25 === 0) {
        try { await persist() } catch (error) { stopped = true; report.failures.push({ message: error.message }) }
        onProgress({ completed: completed.size, notFound: notFound.size, total: ids.length, failures: report.failures.length })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker))
  await persist()
  report.elapsedMs = now() - Date.parse(report.startedAt)
  report.completedTotal = completed.size
  report.notFoundTotal = notFound.size
  report.remaining = ids.length - completed.size - notFound.size
  return report
}
