import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { RegionPage, regionMetadata } from '../../../../../components/regions/RegionPage'
import { localeForPath } from '../../../../../i18n/routes'

export const revalidate = 0
type Props = { params: Promise<{ language: string; sido: string; district: string }> }
function localeOf(language: string) {
  const locale = localeForPath(`/${language}`)
  if (locale === 'ko') notFound()
  return locale
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { language, sido, district } = await params
  return regionMetadata(localeOf(language), [sido, district])
}
export default async function Page({ params }: Props) {
  const { language, sido, district } = await params
  return <RegionPage locale={localeOf(language)} parts={[sido, district]} />
}
