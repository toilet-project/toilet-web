import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { RegionToiletPage, regionToiletMetadata } from '../../../../../../../../components/regions/RegionToiletPage'
import { asianLocaleForSegment } from '../../../../../../../../i18n/asianRoutes'

type Props = { params: Promise<{ language: string; sido: string; district: string; facility: string }> }
export const revalidate = 2_592_000
export function generateStaticParams() { return [] }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const p = await params; const locale = asianLocaleForSegment(p.language); if (!locale) notFound(); return regionToiletMetadata(p.sido, p.district, p.facility, locale) }
export default async function Page({ params }: Props) { const p = await params; const locale = asianLocaleForSegment(p.language); if (!locale) notFound(); return <RegionToiletPage province={p.sido} district={p.district} facility={p.facility} locale={locale} /> }
