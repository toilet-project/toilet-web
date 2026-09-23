import type { Locale } from './locale'

type RegionNames = { province?: string; district?: string }

const countryName: Record<Locale, string> = {
  ko: '전국', en: 'Korea', ja: '韓国', 'zh-CN': '韩国', 'zh-TW': '韓國', 'zh-HK': '韓國',
}

function placeName(locale: Locale, { province, district }: RegionNames) {
  if (!province) return countryName[locale]
  if (!district) return province
  if (locale === 'en') return `${district}, ${province}`
  if (locale === 'ja') return `${province}・${district}`
  if (locale.startsWith('zh-')) return `${province}${district}`
  return `${province} ${district}`
}

export function regionSeoCopy(locale: Locale, names: RegionNames) {
  const place = placeName(locale, names)
  switch (locale) {
    case 'ko': return {
      title: `${place} 화장실 위치 지도`,
      description: names.district
        ? `${place} 공중화장실 위치를 지도에서 찾아보세요. 시설별 주소와 이용 정보를 확인할 수 있습니다.`
        : names.province
          ? `${place} 공중화장실 위치를 지도에서 찾아보세요. 시·군·구를 선택해 시설별 이용 정보를 확인할 수 있습니다.`
          : '전국 공중화장실 위치를 지역별 지도에서 찾아보세요. 시·도와 시·군·구를 선택해 시설별 이용 정보를 확인할 수 있습니다.',
    }
    case 'en': return {
      title: `Public Restroom Map in ${place}`,
      description: `Looking for a free restroom in ${place}? Find public restroom locations on the map and check access details before visiting.`,
    }
    case 'ja': return {
      title: `${place}の公衆トイレ位置マップ`,
      description: `${place}で無料トイレをお探しですか？公衆トイレの場所を地図で探し、利用情報を確認できます。`,
    }
    case 'zh-CN': return {
      title: `${place}公共厕所位置地图`,
      description: `在${place}找免费厕所？查看公共厕所的位置和开放信息，出发前请确认。`,
    }
    case 'zh-TW': return {
      title: `${place}公共廁所位置地圖`,
      description: `在${place}找免費廁所？查看公共廁所位置與開放資訊，前往前請確認。`,
    }
    case 'zh-HK': return {
      title: `${place}公廁位置地圖`,
      description: `在${place}找免費公廁？查看公廁位置與開放資訊，前往前請確認。`,
    }
  }
}
