import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import '../index.css'
import '../App.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://geupddong.com'),
  title: { default: '급똥 | 내 주변 공중화장실 찾기', template: '%s | 급똥' },
  description: '급똥은 현재 위치와 장소 검색으로 가까운 공중화장실의 위치, 개방시간, 편의시설을 확인하는 지도 서비스입니다.',
  applicationName: '급똥',
  icons: { icon: '/favicon.svg?v=1', apple: '/favicon.svg?v=1' },
  manifest: '/site.webmanifest',
  openGraph: { type: 'website', locale: 'ko_KR', siteName: '급똥', images: ['/og-image.png'] },
  twitter: { card: 'summary_large_image', images: ['/og-image.png'] },
  robots: process.env.SITE_INDEXABLE === 'true' ? { index: true, follow: true } : { index: false, follow: false },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#17683A', colorScheme: 'light' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="ko"><body><div id="root">{children}</div></body></html>
}
