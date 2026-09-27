import type { Metadata } from 'next'
import { RegionToiletPage, regionToiletMetadata } from '../../../../../../../../components/regions/RegionToiletPage'

type Props = { params: Promise<{ sido: string; district: string; facility: string }> }
export const revalidate = 0 // Compose current shell; retain explicit data caches.
export async function generateMetadata({ params }: Props): Promise<Metadata> { const p = await params; return regionToiletMetadata(p.sido, p.district, p.facility, 'en') }
export default async function Page({ params }: Props) { const p = await params; return <RegionToiletPage province={p.sido} district={p.district} facility={p.facility} locale="en" /> }
