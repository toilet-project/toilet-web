import { getDistrict } from '../../../../lib/regions'
import { getDistrictToiletsWithSource } from '../../../../server/regions'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params
  if (!/^\d{5}$/.test(code) || !getDistrict(code.slice(0, 2), code))
    return Response.json({ error: 'Unknown district' }, { status: 404,
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } })
  try {
    const result = await getDistrictToiletsWithSource(code.slice(0, 2), code)
    return Response.json({ count: result.toilets.length,
      payloadBytes: new TextEncoder().encode(JSON.stringify(result.toilets)).byteLength }, { headers: {
      'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex',
      'X-Region-Marker-Cache': result.source,
    } })
  } catch {
    return Response.json({ error: 'Region markers unavailable' }, { status: 503,
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } })
  }
}
