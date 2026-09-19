import type { Metadata } from 'next'
import { ToiletRouteBridge } from '../../../components/ToiletRouteBridge'
import { englishHomeMetadata, englishHomeData } from '../../../i18n/seo'
import { safeJsonLd } from '../../../lib/seo'

export const metadata: Metadata = {
  title: { absolute: englishHomeMetadata.title },
  description: englishHomeMetadata.description,
  alternates: { canonical: '/en' },
  openGraph: { ...englishHomeMetadata, type: 'website', locale: 'en_US', siteName: 'Geupddong', url: '/en', images: ['/og-image.png'] },
  twitter: { ...englishHomeMetadata, card: 'summary_large_image', images: ['/og-image.png'] },
}

export default function EnglishHomePage() {
  return <><ToiletRouteBridge detail={null} locale="en" /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(englishHomeData()) }} /></>
}
