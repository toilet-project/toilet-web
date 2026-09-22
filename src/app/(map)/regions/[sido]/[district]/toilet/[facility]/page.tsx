import type { Metadata } from 'next'
import { RegionToiletPage, regionToiletMetadata } from '../../../../../../../components/regions/RegionToiletPage'

type Props = { params: Promise<{ sido: string; district: string; facility: string }> }
export const revalidate = 2_592_000
export function generateStaticParams() { return [] }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const p = await params; return regionToiletMetadata(p.sido, p.district, p.facility, 'ko') }
export default async function Page({ params }: Props) { const p = await params; return <RegionToiletPage province={p.sido} district={p.district} facility={p.facility} locale="ko" /> }
