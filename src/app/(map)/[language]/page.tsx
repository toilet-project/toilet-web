import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ToiletRouteBridge } from '../../../components/ToiletRouteBridge'
import { asianLocaleForSegment } from '../../../i18n/asianRoutes'
import { homeMetadata, homeStructuredData } from '../../../i18n/pageSeo'
import { safeJsonLd } from '../../../lib/seo'

type Props = { params: Promise<{ language: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const segment = (await params).language
  const locale = asianLocaleForSegment(segment)
  if (!locale) notFound()
  return { ...homeMetadata(locale), robots: { index: false, follow: false } }
}

export default async function AsianLanguageHomePage({ params }: Props) {
  const locale = asianLocaleForSegment((await params).language)
  if (!locale) notFound()
  return <><ToiletRouteBridge detail={null} locale={locale} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(homeStructuredData(locale)) }} /></>
}

