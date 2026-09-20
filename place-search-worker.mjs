const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

export function normalizeEnglishSearchQuery(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function buildEnglishFtsQuery(value) {
  const normalized = normalizeEnglishSearchQuery(value)
  if (!normalized) return ''
  return normalized.split(' ').slice(0, 8).map(token => `"${token.replaceAll('"', '""')}"*`).join(' AND ')
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } })
}

function displayRegion(row) {
  const parts = [row.region_en, 'South Korea'].filter(Boolean)
  return [...new Set(parts)].join(', ')
}

export async function englishPlaceSearchResponse(request, env) {
  const url = new URL(request.url)
  if (url.pathname !== '/api/place-search') return null
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST' })
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 2_048) return json({ error: 'request_too_large' }, 413)

  let input
  try { input = await request.json() } catch { return json({ error: 'invalid_request' }, 400) }
  const locale = input?.locale
  const rawQuery = typeof input?.query === 'string' ? input.query : ''
  const normalized = normalizeEnglishSearchQuery(rawQuery)
  if (locale !== 'en') return json({ error: 'english_search_only' }, 400)
  if (normalized.length < 2) return json({ results: [] })
  if (rawQuery.length > 120 || normalized.length > 80) return json({ error: 'query_too_long' }, 400)
  if (env.PLACE_SEARCH_ENABLED !== 'true' || !env.PLACE_SEARCH_D1) {
    return json({ error: 'search_unavailable' }, 503)
  }

  const ftsQuery = buildEnglishFtsQuery(normalized)
  if (!ftsQuery) return json({ results: [] })
  const scope = env.PLACE_SEARCH_SCOPE === 'production' ? 'production' : 'preview'
  const prefix = `${normalized}%`

  try {
    const result = await env.PLACE_SEARCH_D1.prepare(`
      SELECT p.id, p.name_en, p.name_ko, p.region_en, p.latitude, p.longitude,
        json_extract(p.audit_json, '$.categoryCode') AS category_code,
        json_extract(p.audit_json, '$.categoryLabelEn') AS category_label_en,
        CASE
          WHEN lower(p.name_en) = ?1 THEN 0
          WHEN lower(p.name_en) LIKE ?2 THEN 1
          ELSE 2
        END AS name_priority,
        bm25(place_search_fts, 0.0, 8.0, 5.0, 3.0, 1.0, 0.5, 0.0) AS relevance
      FROM place_search_fts
      JOIN places p ON p.id = place_search_fts.place_id
      WHERE place_search_fts MATCH ?3
        AND p.search_scope = ?4
        AND p.latitude IS NOT NULL
        AND p.longitude IS NOT NULL
      ORDER BY name_priority ASC, relevance ASC, p.name_en COLLATE NOCASE ASC
      LIMIT 10
    `).bind(normalized, prefix, ftsQuery, scope).all()

    const rows = Array.isArray(result?.results) ? result.results : []
    return json({
      results: rows.map(row => ({
        id: row.id,
        name: row.name_en || row.name_ko,
        address: displayRegion(row),
        categoryCode: row.category_code || 'unknown',
        category: row.category_label_en || 'Place',
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
      })),
    })
  } catch (error) {
    console.error('English place search failed', error instanceof Error ? error.message : String(error))
    return json({ error: 'search_unavailable' }, 503)
  }
}
