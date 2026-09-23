import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { RegionPage, regionMetadata } from '../../../../components/regions/RegionPage'
import { isLocale, type Locale } from '../../../../i18n/locale'

type Props = { params: Promise<{ language: string; parts?: string[] }> }
function localeOf(segment: string): Locale {
  if (segment === 'en' || segment === 'ja') return segment
  if (segment === 'zh-cn') return 'zh-CN'
  if (segment === 'zh-tw') return 'zh-TW'
  if (segment === 'zh-hk') return 'zh-HK'
  notFound()
}
export const revalidate = 2_592_000
// Pre-render the localized nationwide atlases while keeping province and
// district paths available through on-demand generation.
export function generateStaticParams(): { language: string; parts: string[] }[] {
  return ['en', 'ja', 'zh-cn', 'zh-tw', 'zh-hk'].map(language => ({ language, parts: [] }))
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { language, parts } = await params
  return regionMetadata(localeOf(language), parts ?? [])
}
export default async function Page({ params }: Props) {
  const { language, parts } = await params
  const locale = localeOf(language)
  if (!isLocale(locale)) notFound()
  return <RegionPage locale={locale} parts={parts ?? []} />
}
