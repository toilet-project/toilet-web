import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { ENGLISH_UI_ENABLED } from '../../../i18n/feature'
import { asianLocaleForSegment } from '../../../i18n/asianRoutes'

// New regional-language pages are preview-only until copy and the complete journey are reviewed.
export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function AsianLanguageLayout({ children, params }: {
  children: ReactNode; params: Promise<{ language: string }>
}) {
  if (!ENGLISH_UI_ENABLED || !asianLocaleForSegment((await params).language)) notFound()
  return children
}

