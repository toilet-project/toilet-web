import type { Locale } from './locale'

type ShareText = { share: string; copy: string; copied: string; copyFailed: string; shareFailed: string }
export const shareText: Record<Locale, ShareText> = {
  ko: { share: '공유', copy: '링크 복사', copied: '링크를 복사했어요', copyFailed: '복사하지 못했어요. 다시 시도해 주세요.', shareFailed: '공유하지 못했어요. 다시 시도해 주세요.' },
  en: { share: 'Share', copy: 'Copy link', copied: 'Link copied', copyFailed: 'Could not copy. Please try again.', shareFailed: 'Could not share. Please try again.' },
  ja: { share: '共有', copy: 'リンクをコピー', copied: 'リンクをコピーしました', copyFailed: 'コピーできませんでした。再度お試しください。', shareFailed: '共有できませんでした。再度お試しください。' },
  'zh-CN': { share: '分享', copy: '复制链接', copied: '链接已复制', copyFailed: '无法复制，请重试。', shareFailed: '无法分享，请重试。' },
  'zh-TW': { share: '分享', copy: '複製連結', copied: '已複製連結', copyFailed: '無法複製，請再試一次。', shareFailed: '無法分享，請再試一次。' },
  'zh-HK': { share: '分享', copy: '複製連結', copied: '已複製連結', copyFailed: '未能複製，請再試一次。', shareFailed: '未能分享，請再試一次。' },
}
