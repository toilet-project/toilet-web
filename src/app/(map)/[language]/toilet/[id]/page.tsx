import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getToilet } from '../../../../../server/toilets'
import { ToiletRouteBridge } from '../../../../../components/ToiletRouteBridge'
import { asianLocaleForSegment } from '../../../../../i18n/asianRoutes'
import { localizeToiletDetail } from '../../../../../i18n/toiletTranslations'
import { message } from '../../../../../i18n/messages'
import { regionToiletPath } from '../../../../../lib/regionToiletPath'

type Props = { params: Promise<{ language: string; id: string }> }
export const revalidate = 2_592_000
export function generateStaticParams() { return [] }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { language, id } = await params
  const locale = asianLocaleForSegment(language)
  if (!locale) notFound()
  const detail = await getToilet(id)
  if (!detail) return { title: { absolute: message(locale, 'detail.missing') }, robots: { index: false, follow: false } }
  const path = `/${language}${regionToiletPath(detail)}`
  return { title: { absolute: `${localizeToiletDetail(detail, locale).name} | Geupddong` }, alternates: { canonical: path } }
}

export default async function AsianLanguageToiletPage({ params }: Props) {
  const { language, id } = await params
  const locale = asianLocaleForSegment(language)
  if (!locale) notFound()
  const detail = await getToilet(id)
  if (!detail) notFound()
  return <ToiletRouteBridge detail={detail} locale={locale} />
}

