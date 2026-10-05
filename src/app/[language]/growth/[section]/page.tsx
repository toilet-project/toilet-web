import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SiteHeader } from '../../../../components/SiteHeader'
import { SiteFooter } from '../../../../components/SiteFooter'
import { GrowthGuide } from '../../../../components/growth/GrowthGuide'
export const metadata: Metadata = { title: 'Growth guide', robots: { index: false, follow: false } }
export default async function Page({ params }: { params: Promise<{ language: string; section: string }> }) {
  const { language, section } = await params
  if (!['en', 'ja', 'zh-cn', 'zh-tw', 'zh-hk'].includes(language) || section !== 'ranks' && section !== 'levels') notFound()
  return <div className="region-site-shell is-growth-guide-page"><SiteHeader path={`/growth/${section}`} /><GrowthGuide page={section} /><SiteFooter /></div>
}
