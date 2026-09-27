import type { Metadata } from 'next'
import { RegionPage, regionMetadata } from '../../../../components/regions/RegionPage'

// The map shell streams immediately; public facility data keeps its stable R2 cache.
export const revalidate = 0
type Props = { params: Promise<{ sido: string; district: string }> }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sido, district } = await params
  return regionMetadata('ko', [sido, district])
}
export default async function Page({ params }: Props) {
  const { sido, district } = await params
  return <RegionPage locale="ko" parts={[sido, district]} />
}
