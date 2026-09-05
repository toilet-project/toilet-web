import type { Metadata } from 'next'

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { title: '급똥 | 내 주변 공중화장실 찾기', url: '/', images: ['/og-image.png'] },
}

export default function HomePage() {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [{
      '@type': 'WebSite',
      '@id': 'https://geupddong.com/#website',
      url: 'https://geupddong.com/',
      name: '급똥',
      inLanguage: 'ko-KR',
      description: '급똥은 내 주변 공중화장실을 빠르게 찾는 지도 서비스입니다.',
    }, {
      '@type': 'WebApplication',
      '@id': 'https://geupddong.com/#web-application',
      name: '급똥',
      url: 'https://geupddong.com/',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ko-KR',
      description: '현재 위치와 장소 검색으로 가까운 공중화장실의 위치, 개방시간, 편의시설을 확인하는 지도 서비스입니다.',
      featureList: ['현재 위치 기반 공중화장실 찾기', '장소 검색으로 지도 이동', '공중화장실 개방시간 및 편의시설 확인'],
    }],
  }) }} />
}
