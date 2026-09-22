import type { Metadata } from 'next'
import { RegionPage, regionMetadata } from '../../../components/regions/RegionPage'

type Props = { params: Promise<{ parts?: string[] }> }
export const revalidate = 3600
export function generateStaticParams() { return [] }
export async function generateMetadata({ params }: Props): Promise<Metadata> { return regionMetadata('ko', (await params).parts ?? []) }
export default async function Page({ params }: Props) { return <RegionPage locale="ko" parts={(await params).parts ?? []} /> }
