import { parseMapFilterInput } from '../../../lib/mapFilters.ts'
import { getMapCellBucket } from '../../../server/mapCellCache.ts'
import { readMapFilterArea } from '../../../server/mapFilterArea.ts'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }
const MAX_BODY_BYTES = 100_000

async function readBoundedJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Empty body')
  let bytes = 0
  let text = ''
  const decoder = new TextDecoder()
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('Body too large') }
      text += decoder.decode(chunk.value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  } finally { reader.releaseLock() }
}

export async function POST(request: Request) {
  if (process.env.MAP_FILTERS_ENABLED !== 'true') return Response.json({ error: 'Disabled' }, { status: 404, headers })
  // Public marker queries need no cookies; reject cross-site browsers and never log the body/IDs.
  const origin = request.headers.get('Origin')
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site')
    return Response.json({ error: 'Invalid origin' }, { status: 403, headers })
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')
    || Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY_BYTES)
    return Response.json({ error: 'Invalid request' }, { status: 400, headers })
  let input
  try { input = parseMapFilterInput(await readBoundedJson(request)) } catch { input = null }
  if (!input) return Response.json({ error: 'Unsupported viewport or filters' }, { status: 400, headers })
  try {
    const bucket = await getMapCellBucket()
    if (!bucket) return Response.json({ error: 'Unavailable' }, { status: 503, headers })
    const result = await readMapFilterArea(bucket, input)
    return Response.json(result.response, { headers: { ...headers, 'X-Map-Filter-Cache': result.source,
      'X-Map-Origin-Reads': String(result.originReads),
      ...(result.sourceDate ? { 'X-Map-Filter-Source-Date': result.sourceDate } : {}) } })
  } catch {
    // No exception payloads: liked IDs and user-supplied content must not reach shared logs.
    console.error('Map filter area temporarily unavailable')
    return Response.json({ error: 'Map temporarily unavailable' }, { status: 503, headers })
  }
}
