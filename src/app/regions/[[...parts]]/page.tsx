import type { Metadata } from 'next'
import { RegionPage, regionMetadata } from '../../../components/regions/RegionPage'
import { localizedRegionPath, provinces } from '../../../lib/regions'

type Props = { params: Promise<{ parts?: string[] }> }
export const revalidate = 2_592_000
// The nationwide atlas is a primary navigation target and contains only
// build-time region data. Ship all nationwide and province views with the release.
export function generateStaticParams(): { parts: string[] }[] {
  return [{ parts: [] }, ...provinces.map(province => ({
    parts: [localizedRegionPath('ko', province.code).slice('/regions/'.length)],
  }))]
}
export async function generateMetadata({ params }: Props): Promise<Metadata> { return regionMetadata('ko', (await params).parts ?? []) }
export default async function Page({ params }: Props) { return <RegionPage locale="ko" parts={(await params).parts ?? []} /> }
