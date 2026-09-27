export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ version: process.env.NEXT_PUBLIC_APP_VERSION || 'development', detailCache: 'shared-content-v1' }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'CDN-Cache-Control': 'no-store',
      'Cloudflare-CDN-Cache-Control': 'no-store',
    },
  })
}
