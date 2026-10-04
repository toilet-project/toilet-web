import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SiteHeader } from '../../../components/SiteHeader'
import { SiteFooter } from '../../../components/SiteFooter'
import { GrowthGuide } from '../../../components/growth/GrowthGuide'
export const metadata: Metadata = { title: '성장 가이드', robots: { index: false, follow: false } }
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (section !== 'ranks' && section !== 'levels') notFound()
  return <div className="region-site-shell"><SiteHeader path={`/growth/${section}`} /><GrowthGuide page={section} /><SiteFooter /></div>
}
