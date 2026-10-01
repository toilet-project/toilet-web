import type { Locale } from './locale'
const copy = {
  views: ['조회', 'Views', '閲覧', '浏览', '瀏覽'],
  like: ['좋아요', 'Like', 'いいね', '赞', '讚'],
  unlike: ['좋아요 취소', 'Unlike', 'いいねを取り消す', '取消赞', '取消讚'],
  unavailable: ['내 좋아요 상태를 불러오지 못했어요', 'Could not load your like status', '自分のいいねを取得できません', '无法加载您的点赞状态', '無法載入您的按讚狀態'],
  failed: ['저장 여부를 확인하지 못했어요. 다시 확인해 주세요.', 'Could not confirm the change. Please check again.', '変更を確認できません。再確認してください。', '无法确认是否已保存，请重试。', '無法確認是否已儲存，請重試。'],
  retry: ['다시 확인', 'Retry', '再確認', '重试', '重試'],
  clear: ['원활', 'Low wait', '空いている', '顺畅', '順暢'],
  unknown: ['정보 없음', 'No data', '情報なし', '暂无数据', '暫無資料'],
  underFive: ['5분 미만', 'Under 5 min', '5分未満', '少于5分钟', '少於5分鐘'],
  wait: ['{n}분 이상', '{n}+ min', '{n}分以上', '{n}分钟以上', '{n}分鐘以上'],
  basis: ['최근 {days}일 · {n}건', 'Last {days} days · {n} reviews', '過去{days}日・{n}件', '近{days}天 · {n}条', '近{days}天 · {n}則'],
  tendency: ['리뷰 기준 대기 경향이며 실시간 혼잡도는 아닙니다.', 'Recent review trend, not live occupancy.', 'レビューに基づく傾向で、リアルタイムの混雑状況ではありません。', '依据近期评价，非实时拥挤情况。', '依據近期評價，非即時擁擠情況。'],
} as const
export function engagementMessage(locale: Locale, key: keyof typeof copy, values: Record<string, number> = {}) {
  let text: string = copy[key][locale === 'ko' ? 0 : locale === 'en' ? 1 : locale === 'ja' ? 2 : locale === 'zh-CN' ? 3 : 4]
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value))
  return text
}
