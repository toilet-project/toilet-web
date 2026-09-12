import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getToilet } from '../../../../server/toilets'
import { ToiletRouteBridge } from '../../../../components/ToiletRouteBridge'

// This test-only renderer has no ISR/static fallback. The ordinary production detail route is unchanged.
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '리뷰 임시 검증', robots: { index: false, follow: false } }

export default async function ReviewVerificationPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.NEXT_PUBLIC_REVIEW_API_ENABLED !== 'true'
    || process.env.NEXT_PUBLIC_API_BASE_URL !== 'https://preview.geupddong.com/__review-verification') notFound()
  const detail = await getToilet((await params).id)
  if (!detail) notFound()
  return <ToiletRouteBridge detail={detail} />
}
