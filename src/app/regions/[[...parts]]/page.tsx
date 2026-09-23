import type { Metadata } from 'next'
import { RegionPage, regionMetadata } from '../../../components/regions/RegionPage'

type Props = { params: Promise<{ parts?: string[] }> }
export const revalidate = 2_592_000
// The nationwide atlas is a primary navigation target and contains only
// build-time region data. Ship it with the deployment so entering /regions
// never waits for the incremental R2 cache to render its first response.
export function generateStaticParams(): { parts: string[] }[] { return [{ parts: [] }] }
export async function generateMetadata({ params }: Props): Promise<Metadata> { return regionMetadata('ko', (await params).parts ?? []) }
export default async function Page({ params }: Props) { return <RegionPage locale="ko" parts={(await params).parts ?? []} /> }
