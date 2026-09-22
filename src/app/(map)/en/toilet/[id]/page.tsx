import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getToilet } from '../../../../../server/toilets'
import { ToiletRouteBridge } from '../../../../../components/ToiletRouteBridge'
import { englishToiletMetadata, englishPlaceData } from '../../../../../i18n/seo'
import { safeJsonLd } from '../../../../../lib/seo'
import { regionToiletPath } from '../../../../../lib/regionToiletPath'
import { ENGLISH_UI_ENABLED } from '../../../../../i18n/feature'

type Props = { params: Promise<{ id: string }> }
export const revalidate = 2_592_000
export function generateStaticParams() { return [] }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!ENGLISH_UI_ENABLED) notFound()
  const detail = await getToilet((await params).id)
  if (!detail) return { title: 'Restroom not found', robots: { index: false, follow: false } }
  const { title, description } = englishToiletMetadata(detail)
  const path = `/en${regionToiletPath(detail, 'en')}`
  return { title, description, alternates: { canonical: path },
    openGraph: { title, description, type: 'website', locale: 'en_US', siteName: 'Geupddong', url: path, images: ['/og-image.png'] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og-image.png'] } }
}

export default async function EnglishToiletPage({ params }: Props) {
  if (!ENGLISH_UI_ENABLED) notFound()
  // Same public origin data and revision-aware R2 object as the Korean page.
  const detail = await getToilet((await params).id)
  if (!detail) notFound()
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(englishPlaceData(detail)) }} />
    <ToiletRouteBridge detail={detail} locale="en" /></>
}
