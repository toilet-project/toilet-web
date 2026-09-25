import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { RegionPage, regionMetadata } from '../../../../components/regions/RegionPage'
import { isLocale, type Locale } from '../../../../i18n/locale'
import { localizedRegionPath, provinces } from '../../../../lib/regions'

type Props = { params: Promise<{ language: string; parts?: string[] }> }
function localeOf(segment: string): Locale {
  if (segment === 'en' || segment === 'ja') return segment
  if (segment === 'zh-cn') return 'zh-CN'
  if (segment === 'zh-tw') return 'zh-TW'
  if (segment === 'zh-hk') return 'zh-HK'
  notFound()
}
export const revalidate = 2_592_000
// Pre-render localized nationwide and province atlases; districts stay on-demand.
export function generateStaticParams(): { language: string; parts: string[] }[] {
  return ['en', 'ja', 'zh-cn', 'zh-tw', 'zh-hk'].flatMap(language => {
    const locale = localeOf(language)
    return [{ language, parts: [] }, ...provinces.map(province => ({
      language, parts: [localizedRegionPath(locale, province.code).slice('/regions/'.length)],
    }))]
  })
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
