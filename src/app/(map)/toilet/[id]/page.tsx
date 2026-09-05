import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getToilet } from '../../../../server/toilets'
import { toiletPath } from '../../../../lib/toiletRoute'
import { ToiletRouteBridge } from '../../../../components/ToiletRouteBridge'
import { placeData, safeJsonLd, toiletMetadataText } from '../../../../lib/seo'

type Props = { params: Promise<{ id: string }> }
export const revalidate = 3600
// On demand, never pre-build the nationwide data set.
export function generateStaticParams() { return [] }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const detail = await getToilet((await params).id)
  if (!detail) return { title: '화장실 정보를 찾을 수 없습니다', robots: { index: false, follow: false } }
  const { title, description } = toiletMetadataText(detail)
  return { title, description, alternates: { canonical: toiletPath(detail.id) },
    openGraph: { title, description, url: toiletPath(detail.id), images: ['/og-image.png'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og-image.png'] } }
}

export default async function ToiletPage({ params }: Props) {
  const detail = await getToilet((await params).id)
  if (!detail) notFound()
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(placeData(detail)) }} />
    <ToiletRouteBridge detail={detail} /></>
}
