import { safeJsonLd } from '../../../../lib/seo'
import { facilityMetadata } from '../../../../server/facilityMetadata'
import { localizedPlaceData } from '../../../../i18n/pageSeo'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getToilet } from '../../../../server/toilets'
import { ToiletRouteBridge } from '../../../../components/ToiletRouteBridge'

type Props = { params: Promise<{ id: string }> }
export const revalidate = 2_592_000
// On demand, never pre-build the nationwide data set.
export function generateStaticParams() { return [] }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const detail = await getToilet((await params).id)
  if (!detail) return { title: '화장실 정보를 찾을 수 없습니다', robots: { index: false, follow: false } }
  return facilityMetadata(detail, 'ko', true)
}

export default async function ToiletPage({ params }: Props) {
  const detail = await getToilet((await params).id)
  if (!detail) notFound()
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(localizedPlaceData(detail, 'ko')) }} />
    <ToiletRouteBridge detail={detail} /></>
}
