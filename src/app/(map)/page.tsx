import type { Metadata } from 'next'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { title: '급똥 | 내 주변 공중화장실 찾기', url: '/', images: ['/og-image.png'] },
}

export default function HomePage() {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': 'https://geupddong.com/#website',
    url: 'https://geupddong.com/',
    name: '급똥',
    inLanguage: 'ko-KR',
    description: '급똥은 내 주변 공중화장실을 빠르게 찾는 지도 서비스입니다.',
  }) }} />
}
