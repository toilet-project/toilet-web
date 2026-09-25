import type { Locale } from './locale'

export const homeCopy: Record<Locale, { title: string; heading: string; intro: string; description: string; regions: string }> = {
  ko: {
    title: '급똥 | 내 주변 공중·개방 화장실 찾기, 위치와 이용정보',
    heading: '내 주변 공중·개방 화장실 찾기',
    intro: '현재 위치나 장소명으로 가까운 화장실과 이용정보를 확인하세요.',
    description: '급할 때 가까운 화장실을 급똥에서 찾아보세요. 현재 위치나 장소명으로 전국 공중·개방 화장실을 검색하고 주소, 개방시간과 편의시설 정보를 확인할 수 있습니다. 지역별 지도에서 방문할 곳 주변의 화장실도 미리 살펴보세요.',
    regions: '지역별 화장실 지도',
  },
  en: {
    title: 'Geupddong | Find Nearby Public Restrooms in Korea', heading: 'Find nearby public restrooms in Korea',
    intro: 'Search by location or place name to find restrooms and visitor information.',
    description: 'Find nearby public restrooms in Korea with Geupddong. Search by location or place name, browse regional maps, and check addresses, opening hours and facilities.',
    regions: 'Browse restroom maps by region',
  },
  ja: {
    title: '韓国の近くの公衆トイレ検索・場所と利用情報 | Geupddong', heading: '韓国の近くの公衆トイレを探す',
    intro: '現在地や地名から近くのトイレと利用情報を確認できます。',
    description: 'Geupddongで韓国の近くの公衆トイレを探しましょう。現在地や地名で検索し、住所、開放時間、設備の情報を確認できます。地域別の地図から、目的地の周辺にあるトイレも事前に探せます。', regions: '地域別のトイレ地図',
  },
  'zh-CN': {
    title: '韩国附近公共厕所查询・位置与使用信息 | Geupddong', heading: '查找韩国附近的公共厕所',
    intro: '按当前位置或地点名称查找附近的厕所和使用信息。',
    description: '使用Geupddong查找韩国附近的公共厕所。按当前位置或地点名称搜索，查看地址、开放时间和设施信息。也可以浏览地区地图，提前了解目的地周边的厕所位置。', regions: '按地区浏览厕所地图',
  },
  'zh-TW': {
    title: '韓國附近公共廁所查詢・位置與使用資訊 | Geupddong', heading: '尋找韓國附近的公共廁所',
    intro: '依目前位置或地點名稱尋找附近的廁所與使用資訊。',
    description: '使用Geupddong尋找韓國附近的公共廁所。依目前位置或地點名稱搜尋，查看地址、開放時間與設施資訊。也可以瀏覽地區地圖，提前了解目的地周邊的廁所位置。', regions: '依地區瀏覽廁所地圖',
  },
  'zh-HK': {
    title: '韓國附近公廁搜尋・位置與使用資訊 | Geupddong', heading: '尋找韓國附近的公廁',
    intro: '按目前位置或地點名稱尋找附近的公廁及使用資訊。',
    description: '使用Geupddong尋找韓國附近的公廁。按目前位置或地點名稱搜尋，查看地址、開放時間及設施資訊。亦可瀏覽地區地圖，預先了解目的地附近的公廁位置。', regions: '按地區瀏覽公廁地圖',
  },
}
