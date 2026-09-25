import type { Metadata } from 'next'
import type { ToiletDetailResponse } from '../api/toilets'
import type { Locale } from './locale'
import { localizeToiletDetail } from './toiletTranslations.ts'
import { getDisplayAddress } from '../lib/address.ts'
import { placeData, SITE_ORIGIN, toiletMetadataText } from '../lib/seo.ts'
import { regionToiletPath } from '../lib/regionToiletPath.ts'
import { localizedPublicPath } from './routes.ts'

import { homeCopy } from './homeCopy.ts'
export { homeCopy } from './homeCopy.ts'

const ogLocales: Record<Locale, string> = { ko: 'ko_KR', en: 'en_US', ja: 'ja_JP', 'zh-CN': 'zh_CN', 'zh-TW': 'zh_TW', 'zh-HK': 'zh_HK' }
export function socialMetadata(title: string, description: string, path: string, locale: Locale): Pick<Metadata, 'openGraph' | 'twitter'> {
  const images = [{ url: '/og-image.png', width: 1730, height: 909, alt: homeCopy[locale].heading }]
  return {
    openGraph: { title, description, url: path, type: 'website', locale: ogLocales[locale], siteName: locale === 'ko' ? '급똥' : 'Geupddong', images },
    twitter: { title, description, card: 'summary_large_image', images },
  }
}

export function homeMetadata(locale: Locale): Metadata {
  const { title, description } = homeCopy[locale]
  const path = localizedPublicPath('/', locale)!
  return { title: { absolute: title }, description, alternates: { canonical: path }, ...socialMetadata(title, description, path, locale) }
}

export function homeStructuredData(locale: Locale) {
  const { title, description } = homeCopy[locale]
  const url = new URL(localizedPublicPath('/', locale)!, SITE_ORIGIN).href
  return { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebSite', '@id': `${url}#website`, url, name: locale === 'ko' ? '급똥' : 'Geupddong', inLanguage: locale, description },
    { '@type': 'WebApplication', '@id': `${url}#web-application`, url, name: title, description, inLanguage: locale, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web' },
  ] }
}

export function facilityMetadataText(detail: ToiletDetailResponse, locale: Locale) {
  const display = localizeToiletDetail(detail, locale)
  const name = display.name.trim()
  const address = getDisplayAddress(display.roadAddress, display.jibunAddress)
  if (locale === 'ko') {
    const copy = toiletMetadataText(detail)
    return { title: `${copy.title} | 급똥`, description: `${copy.description}${address ? ` 주소: ${address}.` : ''} 지도에서 위치와 제공된 편의시설 정보를 살펴보고 방문을 준비하세요.` }
  }
  const text = locale === 'en' ? { title: /restroom|toilet/i.test(name) ? name : `${name} — Public restroom`, description: `Find ${name}${address ? ` at ${address}` : ' in Korea'}. Check the map, opening hours and available facility information before visiting.` }
    : locale === 'ja' ? { title: `${name}｜トイレの場所・利用情報`, description: `${name}の場所、開放時間、設備の情報を確認できます。${address ? `住所：${address}。` : ''}訪問前に地図と掲載情報をご確認ください。` }
      : locale === 'zh-CN' ? { title: `${name}｜厕所位置与使用信息`, description: `查看${name}的位置、开放时间和设施信息。${address ? `地址：${address}。` : ''}出发前可通过地图确认位置和已提供的使用信息。` }
        : locale === 'zh-HK' ? { title: `${name}｜公廁位置與使用資訊`, description: `查看${name}的位置、開放時間及設施資訊。${address ? `地址：${address}。` : ''}出發前可透過地圖確認位置及已提供的使用資訊。` }
          : { title: `${name}｜廁所位置與使用資訊`, description: `查看${name}的位置、開放時間與設施資訊。${address ? `地址：${address}。` : ''}前往前可透過地圖確認位置與已提供的使用資訊。` }
  return { title: `${text.title} | Geupddong`, description: text.description }
}

export function localizedPlaceData(detail: ToiletDetailResponse, locale: Locale) {
  const display = localizeToiletDetail(detail, locale)
  const base = placeData(detail)
  const address = getDisplayAddress(display.roadAddress, display.jibunAddress)
  return { ...base, name: display.name, url: encodeURI(SITE_ORIGIN + localizedPublicPath(regionToiletPath(detail, locale), locale)!),
    description: facilityMetadataText(detail, locale).description,
    ...(address ? { address: { ...base.address, '@type': 'PostalAddress', streetAddress: address, addressCountry: 'KR' } } : {}),
  }
}
