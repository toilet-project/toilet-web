import { notFound } from 'next/navigation'
import { ReviewPreview } from '../../components/reviews/ReviewPreview'

export const dynamic = 'force-dynamic'
export const metadata = { title: '리뷰 디자인 프리뷰', robots: { index: false, follow: false } }

export default function ReviewPreviewPage() {
  // Never publish the sample-only review experience on the indexable production build.
  if (process.env.SITE_INDEXABLE === 'true') notFound()
  return <ReviewPreview />
}
