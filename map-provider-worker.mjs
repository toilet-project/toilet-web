const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

export function mapProviderConfigResponse(request, env) {
  const url = new URL(request.url)
  if (url.pathname !== '/api/map-provider-config') return null
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...JSON_HEADERS, Allow: 'GET' },
    })
  }

  if (env.NAVER_MAP_ENABLED !== 'true' || !env.NAVER_MAP_CLIENT_ID) {
    return json({ error: 'map_unavailable' }, 503)
  }

  return json({ provider: 'naver', clientId: env.NAVER_MAP_CLIENT_ID })
}
