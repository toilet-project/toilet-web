export const dynamic = 'force-dynamic'

export function GET() {
  const javascriptKey = process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY

  return Response.json(
    {
      enabled: Boolean(javascriptKey),
      javascriptKey: javascriptKey ?? null,
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  )
}
