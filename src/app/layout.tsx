import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { ServiceAnalytics } from '../components/ServiceAnalytics'
import { LocaleDocument } from '../i18n/LocaleDocument'
import { BRAND_ASSET_BASE, BRAND_MANIFEST_URL, BRAND_SOCIAL_IMAGE } from '../lib/brand'
import '../index.css'
import '../App.css'
// Keep global override order deterministic on initial, cached and restored routes.
import '../components/mobile-navigation.css'
import '../components/app-update.css'
import '../components/reviews/reviews.css'
import '../components/history.css'
import '../components/regions/regions.css'
import '../components/site-chrome.css'
import '../components/toilet-list.css'
import '../components/home-intro.css'
import '../components/map-startup.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://geupddong.com'),
  title: { default: '급똥 | 내 주변 공중화장실 찾기', template: '%s | 급똥' },
  description: '급똥은 현재 위치와 장소 검색으로 가까운 공중화장실의 위치, 개방시간, 편의시설을 확인하는 지도 서비스입니다.',
  applicationName: '급똥',
  icons: {
    icon: [
      { url: `${BRAND_ASSET_BASE}/favicon.svg`, type: 'image/svg+xml', sizes: 'any' },
      { url: `${BRAND_ASSET_BASE}/favicon-32.png`, type: 'image/png', sizes: '32x32' },
    ],
    apple: [{ url: `${BRAND_ASSET_BASE}/apple-touch-icon.png`, type: 'image/png', sizes: '180x180' }],
  },
  manifest: BRAND_MANIFEST_URL,
  openGraph: { type: 'website', locale: 'ko_KR', siteName: '급똥', images: [BRAND_SOCIAL_IMAGE] },
  twitter: { card: 'summary_large_image', images: [BRAND_SOCIAL_IMAGE] },
  robots: process.env.SITE_INDEXABLE === 'true' ? { index: true, follow: true } : { index: false, follow: false },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#17683A', colorScheme: 'light' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return <LocaleDocument><body><ServiceAnalytics /><div id="root">{children}</div></body></LocaleDocument>
}
