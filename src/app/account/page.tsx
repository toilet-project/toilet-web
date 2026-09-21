import type { Metadata } from 'next'
import { SiteHeader } from '../../components/SiteHeader'
import { SiteFooter } from '../../components/SiteFooter'
import { AccountWorkspace, type AccountView } from '../../components/AccountWorkspace'

export const metadata: Metadata = { title: '내 페이지', robots: { index: false, follow: false } }
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const view = (await searchParams).view
  const selected: AccountView = view === 'reviews' || view === 'reports' || view === 'settings' || view === 'notifications' ? view : 'home'
  return <div className="region-site-shell"><SiteHeader path="/account" /><main className="account-page-main"><AccountWorkspace view={selected} /></main><SiteFooter /></div>
}
