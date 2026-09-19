import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ENGLISH_UI_ENABLED } from '../../../i18n/feature'

// Keep incomplete English pages out of search results until the full phase is accepted.
export const metadata: Metadata = {
  title: { default: 'Geupddong | Find public toilets nearby', template: '%s | Geupddong' },
  description: 'Find public toilets in Korea, with locations, opening hours and facilities.',
  applicationName: 'Geupddong',
  openGraph: { locale: 'en_US', siteName: 'Geupddong', images: ['/og-image.png'] },
  robots: { index: false, follow: false },
}

export default function EnglishLayout({ children }: { children: ReactNode }) {
  if (!ENGLISH_UI_ENABLED) notFound()
  return children
}
