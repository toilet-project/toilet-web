import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ToiletRouteBridge } from '../../../components/ToiletRouteBridge'
import { asianLocaleForSegment } from '../../../i18n/asianRoutes'
import { message } from '../../../i18n/messages'
import { freeRestroomSearchPrompt } from '../../../i18n/searchCopy'

type Props = { params: Promise<{ language: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const segment = (await params).language
  const locale = asianLocaleForSegment(segment)
  if (!locale) notFound()
  return { title: { absolute: `${message(locale, 'map.title')} | Geupddong` }, description: freeRestroomSearchPrompt(locale),
    alternates: { canonical: `/${segment}` }, robots: { index: false, follow: false } }
}

export default async function AsianLanguageHomePage({ params }: Props) {
  const locale = asianLocaleForSegment((await params).language)
  if (!locale) notFound()
  return <ToiletRouteBridge detail={null} locale={locale} />
}

