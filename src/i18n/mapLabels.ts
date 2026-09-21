import type { Locale } from './locale.ts'
import { message } from './messages.ts'

// Only called for app-generated notices, never facility fields or user text.
const notices = {
  "로그인 상태를 확인하고 있어요. 잠시 후 다시 눌러 주세요.": "Checking your login. Please try again shortly.",
  "필수 약관 동의를 먼저 완료해 주세요.": "Please accept the required terms first.",
  "로그인 계정이 변경됐어요. 리뷰를 다시 눌러 주세요.": "Your account has changed. Please select Review again.",
  "로그인이 취소되었거나 완료되지 않았습니다. 다시 시도해 주세요.": "Login was cancelled or not completed. Please try again.",
  "제보를 시작하려면 필수 약관에 먼저 동의해 주세요.": "Accept the required terms before submitting a report.",
  "내 제보를 확인하려면 필수 약관에 먼저 동의해 주세요.": "Accept the required terms to view your reports.",
  "로그인이 만료되었어요. 다시 로그인해 주세요.": "Your session expired. Please log in again.",
  "로그아웃하지 못했습니다.": "Could not log out. Please try again.",
  "약관 동의가 완료되었습니다.": "Your consent has been saved.",
  "검색 결과가 없습니다.": "No places found.",
  "장소를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.": "Could not search places. Please try again.",
  "화장실 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.": "Could not load restrooms. Please try again.",
  "지도를 불러오지 못했습니다.": "Could not load the map. Please try again.",
  "이 브라우저에서는 현재 위치를 지원하지 않습니다.": "This browser does not support location access.",
  "위치 권한이 거부되었습니다. 브라우저의 사이트 설정에서 위치를 허용해 주세요.": "Allow location access in your browser’s site settings.",
  "위치 권한이 거부되었습니다. 브라우저 주소창의 위치 권한을 허용한 뒤 다시 시도해 주세요.": "Allow location access in your browser’s site settings, then try again.",
  "현재 위치를 확인할 수 없습니다. GPS·Wi‑Fi 연결을 확인해 주세요.": "Location unavailable. Check your GPS or Wi-Fi connection.",
  "위치 확인 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.": "Location request timed out. Please try again.",
  "현재 위치를 확인하지 못했습니다.": "Could not determine your location."
} satisfies Record<string, string>
const asianNotices: Record<keyof typeof notices, readonly [string, string, string, string]> = {
  "로그인 상태를 확인하고 있어요. 잠시 후 다시 눌러 주세요.": ["ログイン状態を確認中です。少し待ってからもう一度お試しください。", "正在确认登录状态，请稍后重试。", "正在確認登入狀態，請稍後再試。", "正在確認登入狀態，請稍後再試。"],
  "필수 약관 동의를 먼저 완료해 주세요.": ["先に必須規約への同意を完了してください。", "请先同意必需的使用条款。", "請先同意必要的使用條款。", "請先同意必要的使用條款。"],
  "로그인 계정이 변경됐어요. 리뷰를 다시 눌러 주세요.": ["ログインアカウントが変わりました。もう一度レビューを選択してください。", "登录账号已更改，请重新点击评价。", "登入帳戶已變更，請重新點選評論。", "登入帳戶已變更，請重新點選評論。"],
  "로그인이 취소되었거나 완료되지 않았습니다. 다시 시도해 주세요.": ["ログインがキャンセルされたか、完了していません。もう一度お試しください。", "登录已取消或尚未完成，请重试。", "登入已取消或尚未完成，請再試一次。", "登入已取消或尚未完成，請再試一次。"],
  "제보를 시작하려면 필수 약관에 먼저 동의해 주세요.": ["報告する前に必須規約に同意してください。", "提交反馈前，请先同意必需的使用条款。", "提交回報前，請先同意必要的使用條款。", "提交回報前，請先同意必要的使用條款。"],
  "내 제보를 확인하려면 필수 약관에 먼저 동의해 주세요.": ["自分の報告を見るには、先に必須規約に同意してください。", "查看我的反馈前，请先同意必需的使用条款。", "查看我的回報前，請先同意必要的使用條款。", "查看我的回報前，請先同意必要的使用條款。"],
  "로그인이 만료되었어요. 다시 로그인해 주세요.": ["ログインの有効期限が切れました。もう一度ログインしてください。", "登录已过期，请重新登录。", "登入已過期，請重新登入。", "登入已過期，請重新登入。"],
  "로그아웃하지 못했습니다.": ["ログアウトできませんでした。もう一度お試しください。", "无法退出登录，请重试。", "無法登出，請再試一次。", "無法登出，請再試一次。"],
  "약관 동의가 완료되었습니다.": ["規約への同意を保存しました。", "已保存条款同意记录。", "已儲存條款同意紀錄。", "已儲存條款同意紀錄。"],
  "검색 결과가 없습니다.": ["検索結果がありません。", "没有搜索结果。", "沒有搜尋結果。", "沒有搜尋結果。"],
  "장소를 검색하지 못했습니다. 잠시 후 다시 시도해 주세요.": ["場所を検索できませんでした。少し待ってからもう一度お試しください。", "无法搜索地点，请稍后重试。", "無法搜尋地點，請稍後再試。", "無法搜尋地點，請稍後再試。"],
  "화장실 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.": ["トイレ情報を読み込めませんでした。少し待ってからもう一度お試しください。", "无法加载卫生间信息，请稍后重试。", "無法載入廁所資訊，請稍後再試。", "無法載入洗手間資料，請稍後再試。"],
  "지도를 불러오지 못했습니다.": ["地図を読み込めませんでした。もう一度お試しください。", "无法加载地图，请重试。", "無法載入地圖，請再試一次。", "無法載入地圖，請再試一次。"],
  "이 브라우저에서는 현재 위치를 지원하지 않습니다.": ["このブラウザーは現在地の取得に対応していません。", "此浏览器不支持获取当前位置。", "此瀏覽器不支援取得目前位置。", "此瀏覽器不支援取得目前位置。"],
  "위치 권한이 거부되었습니다. 브라우저의 사이트 설정에서 위치를 허용해 주세요.": ["位置情報へのアクセスが拒否されました。ブラウザーのサイト設定で許可してください。", "位置权限被拒绝，请在浏览器的网站设置中允许访问位置。", "位置權限遭拒，請在瀏覽器的網站設定中允許存取位置。", "位置權限遭拒，請在瀏覽器的網站設定中允許存取位置。"],
  "위치 권한이 거부되었습니다. 브라우저 주소창의 위치 권한을 허용한 뒤 다시 시도해 주세요.": ["位置情報へのアクセスが拒否されました。アドレスバーで許可してからもう一度お試しください。", "位置权限被拒绝，请在浏览器地址栏允许访问位置后重试。", "位置權限遭拒，請在瀏覽器網址列允許存取位置後再試。", "位置權限遭拒，請在瀏覽器網址列允許存取位置後再試。"],
  "현재 위치를 확인할 수 없습니다. GPS·Wi‑Fi 연결을 확인해 주세요.": ["現在地を確認できません。GPSやWi-Fiの接続を確認してください。", "无法确认当前位置，请检查 GPS 或 Wi-Fi 连接。", "無法確認目前位置，請檢查 GPS 或 Wi-Fi 連線。", "無法確認目前位置，請檢查 GPS 或 Wi-Fi 連線。"],
  "위치 확인 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.": ["位置情報の取得がタイムアウトしました。少し待ってからもう一度お試しください。", "定位超时，请稍后重试。", "定位逾時，請稍後再試。", "定位逾時，請稍後再試。"],
  "현재 위치를 확인하지 못했습니다.": ["現在地を確認できませんでした。", "无法确认当前位置。", "無法確認目前位置。", "無法確認目前位置。"],
}
const asianNoticeFallback: Record<'ja' | 'zh-CN' | 'zh-TW' | 'zh-HK', string> = {
  ja: '操作を完了できませんでした。もう一度お試しください。',
  'zh-CN': '无法完成操作，请重试。',
  'zh-TW': '無法完成操作，請再試一次。',
  'zh-HK': '無法完成操作，請再試一次。',
}
export function mapSystemNotice(value: string | null, locale: Locale): string {
  if (!value) return ''
  if (locale === 'ko') return value
  if (locale === 'en') return Object.hasOwn(notices, value) ? notices[value as keyof typeof notices] : 'Could not complete the request. Please try again.'
  const index = { ja: 0, 'zh-CN': 1, 'zh-TW': 2, 'zh-HK': 3 }[locale]
  return Object.hasOwn(asianNotices, value)
    ? asianNotices[value as keyof typeof asianNotices][index]
    : asianNoticeFallback[locale]
}

// Change overlay labels in place, without recreating the map, moving its camera or fetching data.
export function localizeMapLabels(root: HTMLElement | null, locale: Locale) {
  root?.querySelectorAll<HTMLElement>('[data-map-label]').forEach(node => {
    const count = Number(node.dataset.mapCount) || 0
    if (node.dataset.mapLabel === 'reference') {
      node.setAttribute('aria-label', locale === 'ko' ? '거리 기준점' : locale === 'en' ? 'Distance reference point' : locale === 'ja' ? '距離の基準点' : locale === 'zh-CN' ? '距离参考点' : '距離參考點')
      const label = node.querySelector('.map-reference-marker-label')
      if (label) label.textContent = locale === 'ko' ? '기준점' : locale === 'en' ? 'Reference' : locale === 'ja' ? '基準点' : locale === 'zh-CN' ? '参考点' : '參考點'
    } else if (node.dataset.mapLabel === 'current') {
      const label = node.querySelector('.sr-only')
      if (label) label.textContent = message(locale, 'map.currentLocation')
    } else if (node.dataset.mapLabel === 'group') {
      const name = node.dataset.mapName || message(locale, 'map.sameLocation')
      node.setAttribute('aria-label', message(locale, 'map.groupMarker', { name, count }))
      if (!node.dataset.mapName) node.textContent = message(locale, 'map.sameLocation') + ' ' + count
    } else if (node.dataset.mapLabel === 'cluster') {
      node.setAttribute('aria-label', message(locale, 'map.clusterMarker', { count }))
    }
  })
}
