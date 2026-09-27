import { safeJsonLd } from '../../../../../lib/seo'
import { facilityMetadata } from '../../../../../server/facilityMetadata'
import { localizedPlaceData } from '../../../../../i18n/pageSeo'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getToilet } from '../../../../../server/toilets'
import { getToiletPage } from '../../../../../server/toiletPage'
import { ToiletRouteBridge } from '../../../../../components/ToiletRouteBridge'
import { asianLocaleForSegment } from '../../../../../i18n/asianRoutes'
import { message } from '../../../../../i18n/messages'

type Props = { params: Promise<{ language: string; id: string }> }
export const revalidate = 0 // Compose current shell; retain explicit data caches.

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { language, id } = await params
  const locale = asianLocaleForSegment(language)
  if (!locale) notFound()
  const detail = await getToilet(id)
  if (!detail) return { title: { absolute: message(locale, 'detail.missing') }, robots: { index: false, follow: false } }
  return facilityMetadata(detail, locale, true)
}

export default async function AsianLanguageToiletPage({ params }: Props) {
  const { language, id } = await params
  const locale = asianLocaleForSegment(language)
  if (!locale) notFound()
  const content = await getToiletPage(id, locale)
  if (!content) notFound()
  const { detail, fragment } = content
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(localizedPlaceData(detail, locale)) }} /><ToiletRouteBridge fragment={fragment} detail={detail} locale={locale} /></>
}

