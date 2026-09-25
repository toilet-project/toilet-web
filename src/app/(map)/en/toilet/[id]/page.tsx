import { facilityMetadata } from '../../../../../server/facilityMetadata'
import { localizedPlaceData } from '../../../../../i18n/pageSeo'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getToilet } from '../../../../../server/toilets'
import { ToiletRouteBridge } from '../../../../../components/ToiletRouteBridge'
import { safeJsonLd } from '../../../../../lib/seo'
import { ENGLISH_UI_ENABLED } from '../../../../../i18n/feature'

type Props = { params: Promise<{ id: string }> }
export const revalidate = 2_592_000
export function generateStaticParams() { return [] }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!ENGLISH_UI_ENABLED) notFound()
  const detail = await getToilet((await params).id)
  if (!detail) return { title: 'Restroom not found', robots: { index: false, follow: false } }
  return facilityMetadata(detail, 'en', true)
}

export default async function EnglishToiletPage({ params }: Props) {
  if (!ENGLISH_UI_ENABLED) notFound()
  // Same public origin data and revision-aware R2 object as the Korean page.
  const detail = await getToilet((await params).id)
  if (!detail) notFound()
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(localizedPlaceData(detail, 'en')) }} />
    <ToiletRouteBridge detail={detail} locale="en" /></>
}
