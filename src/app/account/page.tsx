import type { Metadata } from 'next'
import { SiteHeader } from '../../components/SiteHeader'
import { SiteFooter } from '../../components/SiteFooter'
import { AccountWorkspace, type AccountView } from '../../components/AccountWorkspace'

export const metadata: Metadata = { title: '내 페이지', robots: { index: false, follow: false } }
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string; report?: string }> }) {
  const { view, report } = await searchParams
  const reportId = report && /^\d+$/.test(report) && Number.isSafeInteger(Number(report)) && Number(report) > 0 ? Number(report) : null
  const selected: AccountView = view === 'reviews' || view === 'reports' || view === 'settings' || view === 'notifications' ? view : 'home'
  return <div className="region-site-shell is-account-page"><SiteHeader path="/account" /><main className="account-page-main"><AccountWorkspace view={selected} reportId={reportId} /></main><SiteFooter /></div>
}
