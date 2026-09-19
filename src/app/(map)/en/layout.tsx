import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ENGLISH_UI_ENABLED } from '../../../i18n/feature'
import { englishHomeMetadata } from '../../../i18n/seo'

// Keep incomplete English pages out of search results until the full phase is accepted.
export const metadata: Metadata = {
  title: { default: englishHomeMetadata.title, template: '%s | Geupddong' },
  description: englishHomeMetadata.description,
  applicationName: 'Geupddong',
  openGraph: { locale: 'en_US', siteName: 'Geupddong', images: ['/og-image.png'] },
  robots: { index: false, follow: false },
}

export default function EnglishLayout({ children }: { children: ReactNode }) {
  if (!ENGLISH_UI_ENABLED) notFound()
  return children
}
