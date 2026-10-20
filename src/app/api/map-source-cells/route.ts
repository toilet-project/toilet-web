import { getMapCellBucket } from '../../../server/mapCellCache.ts'
import { parseMapSourceCellsInput, readMapSourceCells } from '../../../server/mapSourceCells.ts'

export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }
const MAX_BODY_BYTES = 4_096

async function readBoundedJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Empty body')
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('Body too large') }
      chunks.push(chunk.value)
    }
    const body = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body))
  } finally { reader.releaseLock() }
}

export async function POST(request: Request) {
  if (process.env.MAP_FILTERS_ENABLED !== 'true') return Response.json({ error: 'Disabled' }, { status: 404, headers })
  const origin = request.headers.get('Origin')
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site')
    return Response.json({ error: 'Invalid origin' }, { status: 403, headers })
  const contentLength = request.headers.get('Content-Length')
  if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json'
    || (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)))
    return Response.json({ error: 'Invalid request' }, { status: 400, headers })
  let cells
  try { cells = parseMapSourceCellsInput(await readBoundedJson(request)) } catch { cells = null }
  if (!cells) return Response.json({ error: 'Unsupported cells' }, { status: 400, headers })
  try {
    const bucket = await getMapCellBucket()
    if (!bucket) return Response.json({ error: 'Unavailable' }, { status: 503, headers })
    const result = await readMapSourceCells(bucket, cells)
    return Response.json(result.response, { headers: { ...headers,
      'X-Map-Cells': String(cells.length), 'X-Map-Filter-Cache': result.source,
      'X-Map-Origin-Reads': String(result.originReads) } })
  } catch {
    // Log neither request coordinates nor origin payloads.
    console.error('Map source cells temporarily unavailable')
    return Response.json({ error: 'Map temporarily unavailable' }, { status: 503, headers })
  }
}
