import type { Locale } from './locale.ts'

// Exact structured labels only. Unknown categories remain the source value.
export function toiletTypeLabel(value: string | undefined, locale: Locale): string {
  const source = value?.trim() || '화장실'
  type Category = 'generic' | 'public' | 'open' | 'portable'
  const categories: Record<string, Category> = { '화장실': 'generic', '공중화장실': 'public', '공공화장실': 'public', '개방화장실': 'open', '개방 화장실': 'open', '간이화장실': 'portable', '이동화장실': 'portable' }
  const category = Object.hasOwn(categories, source) ? categories[source] : undefined
  if (!category) return source
  const labels = {
    ko: { generic: '화장실', public: source, open: source, portable: source },
    en: { generic: 'Restroom', public: 'Public', open: 'Open', portable: 'Portable' },
    ja: { generic: 'トイレ', public: '公衆', open: '開放', portable: '仮設' },
    'zh-CN': { generic: '卫生间', public: '公共', open: '开放', portable: '移动式' },
    'zh-TW': { generic: '廁所', public: '公共', open: '開放', portable: '流動式' },
    'zh-HK': { generic: '洗手間', public: '公眾', open: '開放', portable: '流動式' },
  } satisfies Record<Locale, Record<Category, string>>
  return labels[locale][category]
}
