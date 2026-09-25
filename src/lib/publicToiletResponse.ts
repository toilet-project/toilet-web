/** Public JSON delivery intentionally has no HTTP cache: R2 owns invalidation. */
export async function publicToiletResponse(rawId: string, lookup: (id: number) => Promise<unknown | null>) {
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
  if (!/^[1-9]\d{0,14}$/.test(rawId) || !Number.isSafeInteger(Number(rawId)))
    return Response.json({ error: 'Invalid toilet id' }, { status: 400, headers })
  try {
    const data = await lookup(Number(rawId))
    return data === null
      ? Response.json({ error: 'Toilet not found' }, { status: 404, headers })
      : Response.json(data, { headers })
  } catch {
    return Response.json({ error: 'Toilet temporarily unavailable' }, { status: 503, headers })
  }
}
