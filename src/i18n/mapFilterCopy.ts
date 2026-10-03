import type { Locale } from './locale'

// Five-condition preview source exported on October 3 in Korea.
export const mapFilterPreviewSourceCopy: Record<Locale, string> = {
  ko: '프리뷰 · 10월 3일 공개 데이터 기준',
  en: 'Preview · Public data as of Oct 3',
  ja: 'プレビュー · 10月3日時点の公開データ',
  'zh-CN': '预览 · 10月3日公开数据',
  'zh-TW': '預覽 · 10月3日公開資料',
  'zh-HK': '預覽 · 10月3日公開資料',
}

type Copy = { filters: string; mine: string; member: string; hours: string; cctv: string; diaper: string; bell: string; reset: string; explanation: string; loading: string; error: string; retry: string; empty: string }
const accessibleCopy: Record<Locale, string> = {
  ko: '장애인 화장실', en: 'Accessible restroom', ja: '車いす対応トイレ',
  'zh-CN': '无障碍厕所', 'zh-TW': '無障礙廁所', 'zh-HK': '無障礙洗手間',
}
const listCopy: Record<Locale, string> = { ko: '목록', en: 'List', ja: '一覧', 'zh-CN': '列表', 'zh-TW': '列表', 'zh-HK': '列表' }
const clearAllCopy: Record<Locale, string> = { ko: '전체 해제', en: 'Clear all', ja: 'すべて解除', 'zh-CN': '全部清除', 'zh-TW': '全部清除', 'zh-HK': '全部清除' }
const genderCopy: Record<Locale, { male: string; female: string }> = {
  ko: { male: '남성용', female: '여성용' }, en: { male: 'Men', female: 'Women' },
  ja: { male: '男性用', female: '女性用' }, 'zh-CN': { male: '男厕', female: '女厕' },
  'zh-TW': { male: '男廁', female: '女廁' }, 'zh-HK': { male: '男廁', female: '女廁' },
}
const baseCopy: Record<Locale, Copy> = {
  ko: { filters: '검색 조건', mine: '내 화장실', member: '좋아요한 화장실 · 회원 전용', hours: '24시간', cctv: 'CCTV', diaper: '기저귀', bell: '비상벨', reset: '초기화', explanation: '선택한 조건을 모두 갖춘 화장실만 표시해요. 정보가 확인되지 않은 시설은 제외돼요.', loading: '조건에 맞는 화장실을 찾고 있어요', error: '필터 결과를 불러오지 못했어요.', retry: '다시 시도', empty: '이 지역에 조건을 만족하는 화장실이 없어요.' },
  en: { filters: 'Filters', mine: 'My restrooms', member: 'Liked restrooms · Sign-in required', hours: '24 hours', cctv: 'CCTV', diaper: 'Diaper table', bell: 'Emergency bell', reset: 'Reset', explanation: 'Matches every selected condition. Facilities with unconfirmed information are excluded.', loading: 'Finding matching restrooms', error: 'Could not load filtered results.', retry: 'Retry', empty: 'No restrooms match these filters in this area.' },
  ja: { filters: '絞り込み', mine: 'お気に入り', member: 'お気に入りのトイレ · ログインが必要', hours: '24時間', cctv: '防犯カメラ', diaper: 'おむつ交換台', bell: '非常ベル', reset: 'リセット', explanation: '選択した条件をすべて満たすトイレを表示します。情報が未確認の施設は除外されます。', loading: '条件に合うトイレを検索中', error: '絞り込み結果を読み込めませんでした。', retry: '再試行', empty: 'このエリアに条件に合うトイレはありません。' },
  'zh-CN': { filters: '筛选', mine: '我的厕所', member: '已收藏的厕所 · 需登录', hours: '24小时', cctv: '监控', diaper: '尿布台', bell: '紧急呼叫铃', reset: '重置', explanation: '仅显示符合所有已选条件的厕所，不包括相关信息尚未确认的设施。', loading: '正在查找符合条件的厕所', error: '无法加载筛选结果。', retry: '重试', empty: '此区域没有符合筛选条件的厕所。' },
  'zh-TW': { filters: '篩選', mine: '我的廁所', member: '已收藏的廁所 · 需登入', hours: '24小時', cctv: '監視器', diaper: '尿布台', bell: '緊急求助鈴', reset: '重設', explanation: '僅顯示符合所有已選條件的廁所，不包含相關資訊尚未確認的設施。', loading: '正在尋找符合條件的廁所', error: '無法載入篩選結果。', retry: '重試', empty: '此區域沒有符合篩選條件的廁所。' },
  'zh-HK': { filters: '篩選', mine: '我的洗手間', member: '已收藏的洗手間 · 需登入', hours: '24小時', cctv: '閉路電視', diaper: '尿片更換台', bell: '緊急求助鐘', reset: '重設', explanation: '只顯示符合所有已選條件的洗手間，不包括相關資料尚未確認的設施。', loading: '正在尋找符合條件的洗手間', error: '無法載入篩選結果。', retry: '重試', empty: '此區域沒有符合篩選條件的洗手間。' },
}
export const mapFilterCopy = Object.fromEntries(Object.entries(baseCopy).map(([locale, copy]) =>
  [locale, { ...copy, ...genderCopy[locale as Locale], accessible: accessibleCopy[locale as Locale], list: listCopy[locale as Locale], clearAll: clearAllCopy[locale as Locale] }])) as Record<Locale, Copy & { accessible: string; list: string; clearAll: string; male: string; female: string }>
// Keep the fixed-width mobile list action compact; this never truncates the results.
export function mapFilterCountLabel(count: number): string {
  return count > 99 ? '99+' : String(count)
}
