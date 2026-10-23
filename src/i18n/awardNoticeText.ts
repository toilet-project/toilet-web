import type { Locale } from './locale'
type Text = { title: string; multiple: string; view: string; close: string; error: string; demo: string; replay: string; empty: string }
const labels: Record<Locale, Text> = {
  ko: { title: '새로운 업적을 획득했어요', multiple: '{count}개의 업적을 모았어요', view: '내 업적 보기', close: '닫기', error: '확인을 저장하지 못했어요. 다시 눌러 주세요.', demo: '시연 · 이미 획득한 실제 업적', replay: '획득 알림 다시 보기', empty: '아직 시연할 획득 업적이 없어요.' },
  en: { title: 'Achievement unlocked', multiple: 'You earned {count} achievements', view: 'View my achievements', close: 'Close', error: 'Could not save. Please try again.', demo: 'Preview · achievements you already own', replay: 'Replay achievement notice', empty: 'No earned achievements to preview yet.' },
  ja: { title: '新しい実績を獲得しました', multiple: '{count}個の実績を獲得しました', view: '実績を見る', close: '閉じる', error: '確認を保存できませんでした。もう一度お試しください。', demo: 'プレビュー · 獲得済みの実績', replay: '獲得通知をもう一度見る', empty: '表示できる獲得済みの実績はまだありません。' },
  'zh-CN': { title: '获得了新成就', multiple: '获得了{count}项成就', view: '查看我的成就', close: '关闭', error: '无法保存确认，请重试。', demo: '演示 · 已获得的真实成就', replay: '再次查看成就通知', empty: '暂无可演示的已获成就。' },
  'zh-TW': { title: '獲得了新成就', multiple: '獲得了{count}項成就', view: '查看我的成就', close: '關閉', error: '無法儲存確認，請重試。', demo: '示範 · 已獲得的真實成就', replay: '再次查看成就通知', empty: '尚無可示範的已獲成就。' },
  'zh-HK': { title: '獲得了新成就', multiple: '獲得了{count}項成就', view: '查看我的成就', close: '關閉', error: '無法儲存確認，請重試。', demo: '示範 · 已獲得的真實成就', replay: '再次查看成就通知', empty: '暫無可示範的已獲成就。' },
}
export const awardNoticeText = (locale: Locale) => labels[locale]
