import type { Locale } from './locale'

const labels = {
  ko: { ranksTab: '휴지 등급', levelsTab: '레벨업 방법' },
  en: { ranksTab: 'Roll ranks', levelsTab: 'Level up' },
  ja: { ranksTab: 'ロールランク', levelsTab: 'レベルアップ' },
  'zh-CN': { ranksTab: '纸卷等级', levelsTab: '升级方法' },
  'zh-TW': { ranksTab: '紙捲等級', levelsTab: '升級方法' },
}

export function growthMobileText(locale: Locale) {
  return labels[locale === 'zh-HK' ? 'zh-TW' : locale] ?? labels.en
}
